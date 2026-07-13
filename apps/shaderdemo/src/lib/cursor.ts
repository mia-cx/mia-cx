export const CURSOR_TRAIL_SAMPLES = 16;

export interface CursorTrailSample {
    x: number;
    y: number;
    age: number;
    speed: number;
}
export interface CursorSnapshot {
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    speed: number;
    active: boolean;
    down: boolean;
    movingEnergy: number;
    clickX: number;
    clickY: number;
    clickAge: number;
    clickPolarity: number;
    trail: CursorTrailSample[];
    trailCount: number;
}

/** Allocation-conscious transient pointer state. Coordinates use height as the unit on both axes. */
export class CursorState implements CursorSnapshot {
    x = 0;
    y = 0;
    velocityX = 0;
    velocityY = 0;
    speed = 0;
    active = false;
    down = false;
    movingEnergy = 0;
    clickX = 0;
    clickY = 0;
    clickAge = Number.POSITIVE_INFINITY;
    clickPolarity = -1;
    trail = Array.from({ length: CURSOR_TRAIL_SAMPLES }, (): CursorTrailSample => ({ x: 0, y: 0, age: 0, speed: 0 }));
    trailCount = 0;
    private lastTime = 0;
    private lastTrailX = 0;
    private lastTrailY = 0;

    /** Update from CSS/client coordinates; therefore DPR and internal render scale cannot affect the result. */
    update(
        clientX: number,
        clientY: number,
        rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
        time: number,
        active = true,
    ) {
        if (!(rect.width > 0 && rect.height > 0)) return this;
        const x = ((clientX - rect.left - rect.width * 0.5) / rect.height) * 2;
        // Shader fragment coordinates are top-left-origin: q.y is -1 at the top and +1 at the bottom.
        const y = ((clientY - rect.top - rect.height * 0.5) / rect.height) * 2;
        if (this.lastTime > 0) {
            const dt = Math.max(1 / 240, Math.min(0.1, (time - this.lastTime) / 1000));
            const vx = (x - this.x) / dt,
                vy = (y - this.y) / dt;
            const blend = 1 - Math.exp(-dt * 18);
            this.velocityX += (vx - this.velocityX) * blend;
            this.velocityY += (vy - this.velocityY) * blend;
            this.speed = Math.hypot(this.velocityX, this.velocityY);
            this.movingEnergy = Math.min(1, Math.max(this.movingEnergy, 1 - Math.exp(-this.speed * 0.15)));
        }
        this.x = x;
        this.y = y;
        this.active = active;
        this.lastTime = time;
        if (!this.trailCount || Math.hypot(x - this.lastTrailX, y - this.lastTrailY) >= 0.015) this.pushTrail(x, y);
        return this;
    }
    pointerDown() {
        this.down = true;
        this.active = true;
        this.clickX = this.x;
        this.clickY = this.y;
        this.clickAge = 0;
        this.clickPolarity = -this.clickPolarity;
        return this;
    }
    pointerUp() {
        this.down = false;
        return this;
    }
    leave() {
        this.active = false;
        this.down = false;
        this.lastTime = 0;
        return this;
    }
    /** Advance transient ages. Do not call while paused: trails and click ripples then freeze exactly. */
    tick(dtSeconds: number) {
        const dt = Math.max(0, Math.min(0.25, dtSeconds));
        this.clickAge += dt;
        for (let i = 0; i < this.trailCount; i++) this.trail[i].age += dt;
        this.movingEnergy *= Math.exp(-dt * 5);
        this.velocityX *= Math.exp(-dt * 8);
        this.velocityY *= Math.exp(-dt * 8);
        this.speed = Math.hypot(this.velocityX, this.velocityY);
        return this;
    }
    reset() {
        this.x = this.y = this.velocityX = this.velocityY = this.speed = this.movingEnergy = 0;
        this.active = this.down = false;
        this.clickX = this.clickY = 0;
        this.clickAge = Number.POSITIVE_INFINITY;
        this.clickPolarity = -1;
        this.trailCount = 0;
        this.lastTime = 0;
        return this;
    }
    private pushTrail(x: number, y: number) {
        const sample = this.trail[CURSOR_TRAIL_SAMPLES - 1];
        for (let i = CURSOR_TRAIL_SAMPLES - 1; i > 0; i--) this.trail[i] = this.trail[i - 1];
        this.trail[0] = sample;
        sample.x = x;
        sample.y = y;
        sample.age = 0;
        sample.speed = this.speed;
        this.trailCount = Math.min(CURSOR_TRAIL_SAMPLES, this.trailCount + 1);
        this.lastTrailX = x;
        this.lastTrailY = y;
    }
}
