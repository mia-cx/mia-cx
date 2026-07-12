export interface CursorDensityFieldSnapshot {
    readonly width: number;
    readonly height: number;
    /** Incremented whenever dimensions or texels change. */
    readonly version: number;
    /** Single-channel, row-major, top-left-origin linear density. Quantized only for GPU upload. */
    readonly data: Float32Array;
}

const TARGET_ROWS = 512;
const MAX_COLUMNS = 1024;

interface StrokePoint {
    x: number;
    y: number;
}

/** Persistent, aspect-correct CPU mask used by the cursor density effect. */
export class CursorDensityField {
    width = 1;
    height = TARGET_ROWS;
    version = 0;
    private density = new Float32Array(this.width * this.height);
    private coverage = new Float32Array(this.width * this.height);
    private touched: number[] = [];
    private active = false;
    private stroke: StrokePoint[] = [];

    resize(cssWidth: number, cssHeight: number): boolean {
        const aspect = cssWidth > 0 && cssHeight > 0 ? cssWidth / cssHeight : 1;
        const width = Math.max(1, Math.min(MAX_COLUMNS, Math.round(TARGET_ROWS * aspect)));
        if (width === this.width && this.height === TARGET_ROWS) return false;
        this.width = width;
        this.height = TARGET_ROWS;
        this.density = new Float32Array(width * TARGET_ROWS);
        this.coverage = new Float32Array(width * TARGET_ROWS);
        this.touched = [];
        this.active = false;
        this.stroke = [];
        this.version++;
        return true;
    }

    /** Add one event's radial coverage at shader q coordinates. */
    deposit(x: number, y: number, radius: number, falloff: number, buildUp = 1): boolean {
        if (![x, y, radius, falloff, buildUp].every(Number.isFinite) || radius <= 0 || buildUp <= 0) return false;
        this.rasterCapsule({ x, y }, { x, y }, radius, falloff);
        return this.commitCoverage(buildUp);
    }

    private commitCoverage(buildUp: number): boolean {
        let changed = false;
        const increment = Math.min(1, buildUp);
        for (const index of this.touched) {
            const before = this.density[index];
            const after = Math.min(1, before + increment * this.coverage[index]);
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

    /** Add a pointer position to a smooth midpoint-quadratic stroke. */
    addStrokePoint(x: number, y: number, radius: number, falloff: number, buildUp = 1): boolean {
        if (![x, y, radius, falloff, buildUp].every(Number.isFinite) || radius <= 0 || buildUp <= 0) return false;
        const point = { x, y };
        const last = this.stroke[this.stroke.length - 1];
        if (!last) {
            this.stroke.push(point);
            return false;
        }
        if (last.x === x && last.y === y) return false;
        else if (this.stroke.length === 1) this.rasterCurve(last, point, point, radius, falloff, false);
        else {
            const prior = this.stroke[this.stroke.length - 2];
            this.rasterCurve(this.midpoint(prior, last), last, this.midpoint(last, point), radius, falloff, true);
            this.rasterCurve(this.midpoint(last, point), point, point, radius, falloff, false);
        }
        if (!last || last.x !== x || last.y !== y) this.stroke.push(point);
        if (this.stroke.length > 2) this.stroke.shift();
        return this.commitCoverage(buildUp);
    }

    /** Finish the pending half-segment, or discard history when rasterize is false. */
    endStroke(rasterize = true, radius?: number, falloff?: number): boolean {
        // The latest event includes its pending endpoint, so ending is intensity-neutral.
        const changed = false;
        this.stroke = [];
        return changed;
    }

    private midpoint(a: StrokePoint, b: StrokePoint): StrokePoint {
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    private rasterCurve(
        a: StrokePoint,
        control: StrokePoint,
        b: StrokePoint,
        radius: number,
        falloff: number,
        quadratic: boolean,
    ): boolean {
        const distance = (p: StrokePoint, q: StrokePoint) => Math.hypot(q.x - p.x, q.y - p.y);
        const length = quadratic ? distance(a, control) + distance(control, b) : distance(a, b);
        // Capsules make straight sections exact. Flatten curves until their error is
        // sub-texel, with a length bound to keep rapidly changing tangents smooth.
        const texel = 2 / this.height;
        const curvature = quadratic ? distance(control, this.midpoint(a, b)) : 0;
        const curvatureSteps = Math.ceil(Math.sqrt(curvature / (texel * 0.125)));
        const steps = Math.max(1, Math.ceil(length / (texel * 4)), curvatureSteps);
        let previous = a;
        for (let index = 1; index <= steps; index++) {
            const t = index / steps;
            const u = 1 - t;
            const point = {
                x: quadratic ? u * u * a.x + 2 * u * t * control.x + t * t * b.x : a.x + (b.x - a.x) * t,
                y: quadratic ? u * u * a.y + 2 * u * t * control.y + t * t * b.y : a.y + (b.y - a.y) * t,
            };
            this.rasterCapsule(previous, point, radius, falloff);
            previous = point;
        }
        return this.touched.length > 0;
    }

    /** MAX a radial distance field around a line segment, without point-stamp sampling. */
    private rasterCapsule(a: StrokePoint, b: StrokePoint, radius: number, falloff: number): boolean {
        const aspect = this.width / this.height;
        const minX = Math.max(0, Math.floor((((Math.min(a.x, b.x) - radius) / aspect + 1) * this.width) / 2));
        const maxX = Math.min(
            this.width - 1,
            Math.ceil((((Math.max(a.x, b.x) + radius) / aspect + 1) * this.width) / 2),
        );
        const minY = Math.max(0, Math.floor(((Math.min(a.y, b.y) - radius + 1) * this.height) / 2));
        const maxY = Math.min(this.height - 1, Math.ceil(((Math.max(a.y, b.y) + radius + 1) * this.height) / 2));
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lengthSquared = dx * dx + dy * dy;
        const softness = Math.max(0, Math.min(1, falloff));
        for (let py = minY; py <= maxY; py++) {
            const qy = ((py + 0.5) / this.height) * 2 - 1;
            for (let px = minX; px <= maxX; px++) {
                const qx = (((px + 0.5) / this.width) * 2 - 1) * aspect;
                const projection = lengthSquared
                    ? Math.max(0, Math.min(1, ((qx - a.x) * dx + (qy - a.y) * dy) / lengthSquared))
                    : 0;
                const segmentDistance = Math.hypot(qx - (a.x + projection * dx), qy - (a.y + projection * dy));
                if (segmentDistance >= radius) continue;
                const edgeStart = 1 - softness;
                const t = Math.max(0, Math.min(1, (1 - segmentDistance / radius) / Math.max(softness, 0.001)));
                const value = segmentDistance / radius <= edgeStart ? 1 : t * t * (3 - 2 * t);
                const dataIndex = py * this.width + px;
                if (value > this.coverage[dataIndex]) {
                    if (this.coverage[dataIndex] === 0) this.touched.push(dataIndex);
                    this.coverage[dataIndex] = value;
                }
            }
        }
        return this.touched.length > 0;
    }

    /** Exponential fade. Returns whether texels changed and whether any remain active. */
    tick(dt: number, decayRate: number): { changed: boolean; active: boolean } {
        if (!this.active || !(dt > 0) || !(decayRate > 0)) return { changed: false, active: this.active };
        const multiplier = Math.exp(-decayRate * dt);
        let changed = false;
        let active = false;
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
