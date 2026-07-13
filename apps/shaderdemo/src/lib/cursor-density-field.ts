export interface CursorDensityFieldSnapshot {
    readonly width: number;
    readonly height: number;
    /** Incremented whenever dimensions or texels change. */
    readonly version: number;
    /** Single-channel, row-major, top-left-origin linear density. Quantized only for GPU upload. */
    readonly data: Float32Array;
}

export interface DensityStrokePoint {
    x: number;
    y: number;
    /** DOMHighResTimeStamp, in milliseconds. */
    timeStamp: number;
}

const TARGET_ROWS = 512;
const MAX_COLUMNS = 1024;
export const MOVEMENT_CONTINUITY_MS = 120;
const INITIAL_HEAD_STRENGTH = 0.05;
const BUILD_UP_LOG_CURVE = 3;

/** Logarithmic ease-out: responds early, then approaches full strength progressively. */
export function cursorBuildUpCurve(t: number): number {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
    return Math.log1p(BUILD_UP_LOG_CURVE * clamped) / Math.log1p(BUILD_UP_LOG_CURVE);
}

export function densityPressureCoverage(normalizedDistance: number, falloff: number): number {
    if (!Number.isFinite(normalizedDistance) || !Number.isFinite(falloff) || normalizedDistance >= 1) return 0;
    const distance = Math.max(0, normalizedDistance);
    // Allocate more of the radius to visually significant darker values. This is kept
    // algebraically identical to CURSOR_PAINT_SHADER_SOURCE for CPU/WebGPU parity.
    const perceptualDistance = Math.log(1 + 9 * distance) / Math.log(10);
    const inverseSquare = 1 / (1 + 12 * Math.max(0, falloff) * perceptualDistance * perceptualDistance);
    const edgeT = Math.max(0, Math.min(1, (distance - 0.92) / 0.08));
    const edgeCutoff = 1 - edgeT * edgeT * (3 - 2 * edgeT);
    return inverseSquare * edgeCutoff;
}

/** A global, elapsed-time movement envelope. It never depends on sample count or distance. */
export class MovementEnvelope {
    private movementStart: number | undefined;
    private lastMovement: number | undefined;

    strength(timeStamp: number, buildUpSeconds: number): number {
        if (!Number.isFinite(timeStamp)) return 0;
        if (
            this.movementStart === undefined ||
            this.lastMovement === undefined ||
            timeStamp - this.lastMovement > MOVEMENT_CONTINUITY_MS ||
            timeStamp < this.lastMovement
        )
            this.movementStart = timeStamp;
        this.lastMovement = timeStamp;
        if (!(buildUpSeconds > 0)) return 1;
        const t = Math.max(0, Math.min(1, (timeStamp - this.movementStart) / (buildUpSeconds * 1000)));
        return INITIAL_HEAD_STRENGTH + (1 - INITIAL_HEAD_STRENGTH) * cursorBuildUpCurve(t);
    }

    reset(): void {
        this.movementStart = undefined;
        this.lastMovement = undefined;
    }
}

interface WeightedSegment {
    a: DensityStrokePoint;
    b: DensityStrokePoint;
    strength: number;
}

/** Persistent, aspect-correct CPU mask used by the cursor density effect. */
export class CursorDensityField {
    width = 1;
    height = TARGET_ROWS;
    version = 0;
    /** Number of union raster passes, exposed for performance regression tests. */
    rasterPasses = 0;
    private density = new Float32Array(this.width * this.height);
    private coverage = new Float32Array(this.width * this.height);
    private touched: number[] = [];
    private active = false;
    private stroke: DensityStrokePoint[] = [];
    private envelope = new MovementEnvelope();

    resize(cssWidth: number, cssHeight: number): boolean {
        const aspect = cssWidth > 0 && cssHeight > 0 ? cssWidth / cssHeight : 1;
        const width = Math.max(1, Math.min(MAX_COLUMNS, Math.round(TARGET_ROWS * aspect)));
        if (width === this.width && this.height === TARGET_ROWS) return false;
        this.width = width;
        this.height = TARGET_ROWS;
        this.density = new Float32Array(width * TARGET_ROWS);
        this.coverage = new Float32Array(width * TARGET_ROWS);
        this.touched = [];
        this.endStroke(false);
        this.version++;
        return true;
    }

    /** A max-only stamp. `strength` is an absolute proposed brush intensity. */
    deposit(x: number, y: number, radius: number, falloff: number, strength = 1): boolean {
        if (![x, y, radius, falloff, strength].every(Number.isFinite) || radius <= 0 || strength <= 0) return false;
        const p = { x, y, timeStamp: 0 };
        this.rasterUnion([{ a: p, b: p, strength: Math.min(1, strength) }], radius, falloff);
        return this.commitCoverage();
    }

    private commitCoverage(): boolean {
        let changed = false;
        for (const index of this.touched) {
            const before = this.density[index];
            const after = Math.max(before, this.coverage[index]);
            this.coverage[index] = 0;
            if (after !== before) {
                this.density[index] = after;
                changed = true;
            }
        }
        this.touched.length = 0;
        if (changed) {
            this.active = true;
            this.version++;
        }
        return changed;
    }

    /**
     * Paint all pointer samples recorded during one animation frame as one spline union and
     * one max commit. Near-duplicates are removed, while the final sample is always retained.
     */
    addStrokeBatch(
        points: readonly DensityStrokePoint[],
        radius: number,
        falloff: number,
        buildUpSeconds = 0,
    ): boolean {
        if (![radius, falloff, buildUpSeconds].every(Number.isFinite) || radius <= 0 || points.length === 0)
            return false;
        const valid = points.filter((p) => [p.x, p.y, p.timeStamp].every(Number.isFinite));
        if (!valid.length) return false;
        const texel = 2 / this.height;
        const threshold = Math.max(texel * 1.5, radius * 0.08);
        const filtered: DensityStrokePoint[] = [];
        for (let i = 0; i < valid.length; i++) {
            const p = valid[i];
            const prior = filtered[filtered.length - 1];
            if (!prior || i === valid.length - 1 || Math.hypot(p.x - prior.x, p.y - prior.y) >= threshold)
                filtered.push(p);
        }

        const segments: WeightedSegment[] = [];
        for (const point of filtered) {
            const last = this.stroke[this.stroke.length - 1];
            if (!last) {
                this.stroke.push(point);
                continue; // entering/down/stationary never stamps
            }
            if (last.x === point.x && last.y === point.y) continue;
            const strength = this.envelope.strength(point.timeStamp, buildUpSeconds);
            if (this.stroke.length === 1) this.flattenCurve(last, point, point, false, strength, segments);
            else {
                const prior = this.stroke[this.stroke.length - 2];
                this.flattenCurve(
                    this.midpoint(prior, last),
                    last,
                    this.midpoint(last, point),
                    true,
                    strength,
                    segments,
                );
                this.flattenCurve(this.midpoint(last, point), point, point, false, strength, segments);
            }
            this.stroke.push(point);
            if (this.stroke.length > 2) this.stroke.shift();
        }
        if (!segments.length) return false;
        this.rasterUnion(segments, radius, falloff);
        return this.commitCoverage();
    }

    /** Compatibility helper; callers handling DOM input should use addStrokeBatch. */
    addStrokePoint(x: number, y: number, radius: number, falloff: number, strength = 1): boolean {
        const lastTime = this.stroke[this.stroke.length - 1]?.timeStamp ?? 0;
        const point = { x, y, timeStamp: lastTime + 1 };
        // Preserve the old helper's explicit absolute strength semantics.
        const last = this.stroke[this.stroke.length - 1];
        if (!last) {
            this.stroke.push(point);
            return false;
        }
        if (last.x === x && last.y === y) return false;
        const segments: WeightedSegment[] = [];
        if (this.stroke.length === 1) this.flattenCurve(last, point, point, false, Math.min(1, strength), segments);
        else {
            const prior = this.stroke[this.stroke.length - 2];
            this.flattenCurve(
                this.midpoint(prior, last),
                last,
                this.midpoint(last, point),
                true,
                Math.min(1, strength),
                segments,
            );
            this.flattenCurve(this.midpoint(last, point), point, point, false, Math.min(1, strength), segments);
        }
        this.stroke.push(point);
        if (this.stroke.length > 2) this.stroke.shift();
        this.rasterUnion(segments, radius, falloff);
        return this.commitCoverage();
    }

    endStroke(_rasterize = true, _radius?: number, _falloff?: number): boolean {
        this.stroke = [];
        this.envelope.reset();
        return false;
    }

    private midpoint(a: DensityStrokePoint, b: DensityStrokePoint): DensityStrokePoint {
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, timeStamp: (a.timeStamp + b.timeStamp) / 2 };
    }

    private flattenCurve(
        a: DensityStrokePoint,
        control: DensityStrokePoint,
        b: DensityStrokePoint,
        quadratic: boolean,
        strength: number,
        out: WeightedSegment[],
    ): void {
        const distance = (p: DensityStrokePoint, q: DensityStrokePoint) => Math.hypot(q.x - p.x, q.y - p.y);
        const texel = 2 / this.height;
        const curvature = quadratic ? distance(control, this.midpoint(a, b)) : 0;
        // Capsules represent straight sections exactly; only curvature needs flattening.
        const steps = Math.max(1, Math.ceil(Math.sqrt(curvature / (texel * 0.125))));
        let previous = a;
        for (let index = 1; index <= steps; index++) {
            const t = index / steps;
            const u = 1 - t;
            const point = {
                x: quadratic ? u * u * a.x + 2 * u * t * control.x + t * t * b.x : a.x + (b.x - a.x) * t,
                y: quadratic ? u * u * a.y + 2 * u * t * control.y + t * t * b.y : a.y + (b.y - a.y) * t,
                timeStamp: a.timeStamp + (b.timeStamp - a.timeStamp) * t,
            };
            out.push({ a: previous, b: point, strength });
            previous = point;
        }
    }

    /** Scan the batch bounding box once and MAX the union of all flattened capsules. */
    private rasterUnion(segments: readonly WeightedSegment[], radius: number, falloff: number): void {
        if (!segments.length) return;
        this.rasterPasses++;
        const aspect = this.width / this.height;
        let loX = Infinity,
            hiX = -Infinity,
            loY = Infinity,
            hiY = -Infinity;
        for (const { a, b } of segments) {
            loX = Math.min(loX, a.x, b.x);
            hiX = Math.max(hiX, a.x, b.x);
            loY = Math.min(loY, a.y, b.y);
            hiY = Math.max(hiY, a.y, b.y);
        }
        const minX = Math.max(0, Math.floor((((loX - radius) / aspect + 1) * this.width) / 2));
        const maxX = Math.min(this.width - 1, Math.ceil((((hiX + radius) / aspect + 1) * this.width) / 2));
        const minY = Math.max(0, Math.floor(((loY - radius + 1) * this.height) / 2));
        const maxY = Math.min(this.height - 1, Math.ceil(((hiY + radius + 1) * this.height) / 2));
        for (let py = minY; py <= maxY; py++) {
            const qy = ((py + 0.5) / this.height) * 2 - 1;
            for (let px = minX; px <= maxX; px++) {
                const qx = (((px + 0.5) / this.width) * 2 - 1) * aspect;
                let proposed = 0;
                for (const { a, b, strength } of segments) {
                    const dx = b.x - a.x,
                        dy = b.y - a.y,
                        lengthSquared = dx * dx + dy * dy;
                    const projection = lengthSquared
                        ? Math.max(0, Math.min(1, ((qx - a.x) * dx + (qy - a.y) * dy) / lengthSquared))
                        : 0;
                    const distance = Math.hypot(qx - (a.x + projection * dx), qy - (a.y + projection * dy));
                    if (distance < radius)
                        proposed = Math.max(proposed, strength * densityPressureCoverage(distance / radius, falloff));
                }
                if (!proposed) continue;
                const dataIndex = py * this.width + px;
                if (proposed > this.coverage[dataIndex]) {
                    if (this.coverage[dataIndex] === 0) this.touched.push(dataIndex);
                    this.coverage[dataIndex] = proposed;
                }
            }
        }
    }

    tick(dt: number, decayRate: number): { changed: boolean; active: boolean } {
        if (!this.active || !(dt > 0) || !(decayRate > 0)) return { changed: false, active: this.active };
        const multiplier = Math.exp(-decayRate * dt);
        let changed = false,
            active = false;
        for (let index = 0; index < this.density.length; index++) {
            const before = this.density[index];
            if (!before) continue;
            const after = before * multiplier < 1e-6 ? 0 : before * multiplier;
            if (after !== before) {
                this.density[index] = after;
                changed = true;
            }
            if (after) active = true;
        }
        this.active = active;
        if (changed) this.version++;
        return { changed, active };
    }

    snapshot(): CursorDensityFieldSnapshot {
        return { width: this.width, height: this.height, version: this.version, data: this.density };
    }
}
