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

/** Persistent, aspect-correct CPU mask used by the cursor density effect. */
export class CursorDensityField {
    width = 1;
    height = TARGET_ROWS;
    version = 0;
    private data = new Uint8Array(this.width * this.height);
    private active = false;

    resize(cssWidth: number, cssHeight: number): boolean {
        const aspect = cssWidth > 0 && cssHeight > 0 ? cssWidth / cssHeight : 1;
        const width = Math.max(1, Math.min(MAX_COLUMNS, Math.round(TARGET_ROWS * aspect)));
        if (width === this.width && this.height === TARGET_ROWS) return false;
        this.width = width;
        this.height = TARGET_ROWS;
        this.data = new Uint8Array(width * TARGET_ROWS);
        this.active = false;
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
