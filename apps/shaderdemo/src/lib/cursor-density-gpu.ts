import {
    cursorBuildUpCurve,
    densityMapSize,
    DENSITY_MAP_MAX_COLUMNS,
    DENSITY_MAP_ROWS,
    MOVEMENT_CONTINUITY_MS,
    type DensityStrokePoint,
} from './cursor-density-field';

export { densityMapSize, DENSITY_MAP_MAX_COLUMNS, DENSITY_MAP_ROWS };
export const MAX_GPU_DENSITY_SEGMENTS = 2048;
export const DENSITY_EXTINCTION_THRESHOLD = 1 / 65535;
const INITIAL_HEAD_STRENGTH = 0.05;

export interface CursorDensityUpdate {
    points: readonly DensityStrokePoint[];
    cssWidth: number;
    cssHeight: number;
    dt: number;
    radius: number;
    falloff: number;
    buildUpSeconds: number;
    decayRate: number;
    resetStroke?: boolean;
}

export interface GpuDensitySegment {
    ax: number;
    ay: number;
    bx: number;
    by: number;
    radius: number;
    strength: number;
    falloff: number;
}

export function appendBoundedDensitySegments<T>(
    backlog: T[],
    incoming: readonly T[],
    capacity = MAX_GPU_DENSITY_SEGMENTS,
) {
    const limit = Number.isFinite(capacity) ? Math.max(0, Math.floor(capacity)) : MAX_GPU_DENSITY_SEGMENTS;
    const combined = [...backlog, ...incoming];
    const dropped = Math.max(0, combined.length - limit);
    backlog.splice(0, backlog.length, ...combined.slice(dropped));
    return dropped;
}

/** Stateful midpoint-quadratic flattener. It never examines density texels. */
export class GpuDensityGeometry {
    private stroke: DensityStrokePoint[] = [];
    private movementStart?: number;
    private lastMovement?: number;

    reset() {
        this.stroke = [];
        this.movementStart = undefined;
        this.lastMovement = undefined;
    }

    private strength(time: number, buildUp: number) {
        if (
            this.movementStart === undefined ||
            this.lastMovement === undefined ||
            time - this.lastMovement > MOVEMENT_CONTINUITY_MS ||
            time < this.lastMovement
        )
            this.movementStart = time;
        this.lastMovement = time;
        if (!(buildUp > 0)) return 1;
        const t = Math.max(0, Math.min(1, (time - this.movementStart) / (buildUp * 1000)));
        return INITIAL_HEAD_STRENGTH + (1 - INITIAL_HEAD_STRENGTH) * cursorBuildUpCurve(t);
    }

    add(points: readonly DensityStrokePoint[], radius: number, falloff: number, buildUp: number): GpuDensitySegment[] {
        radius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
        falloff = Number.isFinite(falloff) ? Math.max(0, falloff) : 0;
        buildUp = Number.isFinite(buildUp) ? Math.max(0, buildUp) : 0;
        const valid = points.filter((p) => [p.x, p.y, p.timeStamp].every(Number.isFinite));
        const threshold = Math.max((2 / DENSITY_MAP_ROWS) * 1.5, radius * 0.08);
        const filtered: DensityStrokePoint[] = [];
        for (let i = 0; i < valid.length; i++) {
            const p = valid[i],
                prior = filtered[filtered.length - 1];
            if (!prior || i === valid.length - 1 || Math.hypot(p.x - prior.x, p.y - prior.y) >= threshold)
                filtered.push(p);
        }
        const out: GpuDensitySegment[] = [];
        const mid = (a: DensityStrokePoint, b: DensityStrokePoint): DensityStrokePoint => ({
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
            timeStamp: (a.timeStamp + b.timeStamp) / 2,
        });
        const flatten = (
            a: DensityStrokePoint,
            control: DensityStrokePoint,
            b: DensityStrokePoint,
            quadratic: boolean,
            strength: number,
        ) => {
            const curvature = quadratic ? Math.hypot(control.x - (a.x + b.x) / 2, control.y - (a.y + b.y) / 2) : 0;
            const steps = Math.max(1, Math.ceil(Math.sqrt(curvature / ((2 / DENSITY_MAP_ROWS) * 0.125))));
            let previous = a;
            for (let i = 1; i <= steps; i++) {
                const t = i / steps,
                    u = 1 - t;
                const point = {
                    x: quadratic ? u * u * a.x + 2 * u * t * control.x + t * t * b.x : a.x + (b.x - a.x) * t,
                    y: quadratic ? u * u * a.y + 2 * u * t * control.y + t * t * b.y : a.y + (b.y - a.y) * t,
                    timeStamp: a.timeStamp + (b.timeStamp - a.timeStamp) * t,
                };
                out.push({ ax: previous.x, ay: previous.y, bx: point.x, by: point.y, radius, strength, falloff });
                previous = point;
            }
        };
        for (const point of filtered) {
            const last = this.stroke[this.stroke.length - 1];
            if (!last) {
                this.stroke.push(point);
                this.movementStart = point.timeStamp;
                this.lastMovement = point.timeStamp;
                continue;
            }
            if (last.x === point.x && last.y === point.y) continue;
            const strength = this.strength(point.timeStamp, buildUp);
            if (this.stroke.length === 1) flatten(last, point, point, false, strength);
            else {
                const prior = this.stroke[this.stroke.length - 2];
                flatten(mid(prior, last), last, mid(last, point), true, strength);
                flatten(mid(last, point), point, point, false, strength);
            }
            this.stroke.push(point);
            if (this.stroke.length > 2) this.stroke.shift();
        }
        // Retain the newest continuous endpoint if pathological coalesced input exceeds the bounded upload.
        return out.length <= MAX_GPU_DENSITY_SEGMENTS ? out : out.slice(out.length - MAX_GPU_DENSITY_SEGMENTS);
    }
}
