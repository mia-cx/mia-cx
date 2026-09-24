import { CURSOR_UNIFORM_PARAMETER_SCHEMA } from './cursor-schema';
import type { CursorSnapshot } from './cursor';

/** Compact vec4 cursor block containing the four shader values. */
export const CURSOR_UNIFORM_VEC4S = 1;
export const CURSOR_UNIFORM_FLOATS = 4;
export const CURSOR_UNIFORM_BYTES = 16;
export const CURSOR_PARAMETER_OFFSET = 0;

export function packCursorUniform(parameters: Record<string, number>, _snapshot?: CursorSnapshot) {
    const out = new Float32Array(CURSOR_UNIFORM_FLOATS);
    CURSOR_UNIFORM_PARAMETER_SCHEMA.forEach((parameter, index) => {
        out[index] = parameters[parameter.key] ?? parameter.default;
    });
    return out;
}
