import { CURSOR_PARAMETER_SCHEMA } from './cursor-schema';
import { CURSOR_TRAIL_SAMPLES, type CursorSnapshot } from './cursor';

/** Vec4-only, std140/WGSL-compatible cursor block: 3 state + 13 parameters + 16 trail samples. */
export const CURSOR_UNIFORM_VEC4S = 32;
export const CURSOR_UNIFORM_FLOATS = CURSOR_UNIFORM_VEC4S * 4;
export const CURSOR_UNIFORM_BYTES = CURSOR_UNIFORM_FLOATS * 4;
export const CURSOR_PARAMETER_OFFSET = 12;
export const CURSOR_TRAIL_OFFSET = 64;

const EMPTY_CURSOR: CursorSnapshot = {
    x: 0,
    y: 0,
    velocityX: 0,
    velocityY: 0,
    speed: 0,
    active: false,
    down: false,
    movingEnergy: 0,
    clickX: 0,
    clickY: 0,
    clickAge: Number.POSITIVE_INFINITY,
    clickPolarity: -1,
    trail: [],
    trailCount: 0,
};

export function packCursorUniform(parameters: Record<string, number>, snapshot: CursorSnapshot | undefined) {
    const s = snapshot ?? EMPTY_CURSOR;
    const out = new Float32Array(CURSOR_UNIFORM_FLOATS);
    out.set([s.x, s.y, s.velocityX, s.velocityY, s.speed, s.active ? 1 : 0, s.down ? 1 : 0, s.movingEnergy], 0);
    out.set([s.clickX, s.clickY, Number.isFinite(s.clickAge) ? s.clickAge : 1e20, s.clickPolarity], 8);
    CURSOR_PARAMETER_SCHEMA.forEach((parameter, index) => {
        out[CURSOR_PARAMETER_OFFSET + index] = parameters[parameter.key] ?? parameter.default;
    });
    const count = Math.min(CURSOR_TRAIL_SAMPLES, s.trailCount, s.trail.length);
    for (let i = 0; i < count; i++) {
        const sample = s.trail[i],
            offset = CURSOR_TRAIL_OFFSET + i * 4;
        out.set([sample.x, sample.y, sample.age, sample.speed], offset);
    }
    // The unused lane after the 51 parameters carries the bounded trail count.
    out[CURSOR_PARAMETER_OFFSET + 51] = count;
    return out;
}
