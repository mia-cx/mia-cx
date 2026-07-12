export interface CursorDensityFieldSnapshot {
    readonly width: number;
    readonly height: number;
    /** Incremented whenever dimensions or texels change. */
    readonly version: number;
    /** Single-channel, row-major, top-left-origin R8 texels. */
    readonly data: Uint8Array;
}

const TARGET_ROWS = 128;
const MAX_COLUMNS = 384;

interface StrokePoint {
    x: number;
    y: number;
}

/** Persistent, aspect-correct CPU mask used by the cursor density effect. */
export class CursorDensityField {
    width = 1;
    height = TARGET_ROWS;
    version = 0;
    private data = new Uint8Array(this.width * this.height);
    private active = false;
    private stroke: StrokePoint[] = [];

    resize(cssWidth: number, cssHeight: number): boolean {
        const aspect = cssWidth > 0 && cssHeight > 0 ? cssWidth / cssHeight : 1;
        const width = Math.max(1, Math.min(MAX_COLUMNS, Math.round(TARGET_ROWS * aspect)));
        if (width === this.width && this.height === TARGET_ROWS) return false;
        this.width = width;
        this.height = TARGET_ROWS;
        this.data = new Uint8Array(width * TARGET_ROWS);
        this.active = false;
        this.stroke = [];
        this.version++;
        return true;
    }

    /** Stamp at shader q coordinates (x measured in canvas-height units, y top-left -1..1). */
    deposit(x: number, y: number, radius: number, falloff: number): boolean {
        if (![x, y, radius, falloff].every(Number.isFinite) || radius <= 0) return false;
        const aspect = this.width / this.height;
        const minX = Math.max(0, Math.floor((((x - radius) / aspect + 1) * this.width) / 2));
        const maxX = Math.min(this.width - 1, Math.ceil((((x + radius) / aspect + 1) * this.width) / 2));
        const minY = Math.max(0, Math.floor(((y - radius + 1) * this.height) / 2));
        const maxY = Math.min(this.height - 1, Math.ceil(((y + radius + 1) * this.height) / 2));
        let changed = false;
        const exponent = Math.max(0.01, falloff);
        for (let py = minY; py <= maxY; py++) {
            const qy = ((py + 0.5) / this.height) * 2 - 1;
            for (let px = minX; px <= maxX; px++) {
                const qx = (((px + 0.5) / this.width) * 2 - 1) * aspect;
                const distance = Math.hypot(qx - x, qy - y);
                if (distance >= radius) continue;
                const stamp = Math.round(255 * Math.pow(1 - distance / radius, exponent));
                const index = py * this.width + px;
                if (stamp > this.data[index]) {
                    this.data[index] = stamp;
                    changed = true;
                }
            }
        }
        if (changed) {
            this.active = true;
            this.version++;
        }
        return changed;
    }

    /** Add a pointer position to a smooth midpoint-quadratic stroke. */
    addStrokePoint(x: number, y: number, radius: number, falloff: number): boolean {
        if (![x, y, radius, falloff].every(Number.isFinite) || radius <= 0) return false;
        const point = { x, y };
        const last = this.stroke[this.stroke.length - 1];
        if (last && last.x === x && last.y === y) return this.deposit(x, y, radius, falloff);
        let changed = false;
        if (!last) changed = this.deposit(x, y, radius, falloff);
        else if (this.stroke.length === 1)
            changed = this.rasterCurve(
                last,
                this.midpoint(last, point),
                this.midpoint(last, point),
                radius,
                falloff,
                false,
            );
        else {
            const prior = this.stroke[this.stroke.length - 2];
            changed = this.rasterCurve(
                this.midpoint(prior, last),
                last,
                this.midpoint(last, point),
                radius,
                falloff,
                true,
            );
        }
        this.stroke.push(point);
        if (this.stroke.length > 2) this.stroke.shift();
        return changed;
    }

    /** Finish the pending half-segment, or discard history when rasterize is false. */
    endStroke(rasterize = true, radius?: number, falloff?: number): boolean {
        let changed = false;
        if (rasterize && this.stroke.length > 1 && radius !== undefined && falloff !== undefined) {
            const last = this.stroke[this.stroke.length - 1];
            const prior = this.stroke[this.stroke.length - 2];
            changed = this.rasterCurve(this.midpoint(prior, last), last, last, radius, falloff, true);
        }
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
        let changed = false;
        let previous = a;
        for (let index = 1; index <= steps; index++) {
            const t = index / steps;
            const u = 1 - t;
            const point = {
                x: quadratic ? u * u * a.x + 2 * u * t * control.x + t * t * b.x : a.x + (b.x - a.x) * t,
                y: quadratic ? u * u * a.y + 2 * u * t * control.y + t * t * b.y : a.y + (b.y - a.y) * t,
            };
            changed = this.rasterCapsule(previous, point, radius, falloff) || changed;
            previous = point;
        }
        if (changed) {
            this.active = true;
            this.version++;
        }
        return changed;
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
        const exponent = Math.max(0.01, falloff);
        let changed = false;
        for (let py = minY; py <= maxY; py++) {
            const qy = ((py + 0.5) / this.height) * 2 - 1;
            for (let px = minX; px <= maxX; px++) {
                const qx = (((px + 0.5) / this.width) * 2 - 1) * aspect;
                const projection = lengthSquared
                    ? Math.max(0, Math.min(1, ((qx - a.x) * dx + (qy - a.y) * dy) / lengthSquared))
                    : 0;
                const segmentDistance = Math.hypot(qx - (a.x + projection * dx), qy - (a.y + projection * dy));
                if (segmentDistance >= radius) continue;
                const value = Math.round(255 * Math.pow(1 - segmentDistance / radius, exponent));
                const dataIndex = py * this.width + px;
                if (value > this.data[dataIndex]) {
                    this.data[dataIndex] = value;
                    changed = true;
                }
            }
        }
        return changed;
    }

    /** Exponential fade. Returns whether texels changed and whether any remain active. */
    tick(dt: number, decayRate: number): { changed: boolean; active: boolean } {
        if (!this.active || !(dt > 0) || !(decayRate > 0)) return { changed: false, active: this.active };
        const multiplier = Math.exp(-decayRate * dt);
        let changed = false;
        let active = false;
        for (let index = 0; index < this.data.length; index++) {
            const before = this.data[index];
            if (!before) continue;
            const after = Math.floor(before * multiplier);
            if (after !== before) {
                this.data[index] = after;
                changed = true;
            }
            if (after) active = true;
        }
        this.active = active;
        if (changed) this.version++;
        return { changed, active };
    }

    snapshot(): CursorDensityFieldSnapshot {
        return { width: this.width, height: this.height, version: this.version, data: this.data };
    }
}
