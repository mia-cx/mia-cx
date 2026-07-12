export type CursorParameter = {
    key: string;
    label: string;
    min: number;
    max: number;
    step: number;
    default: number;
    /** CPU-side texture setting; excluded from the shared shader uniform layout. */
    cpuOnly?: boolean;
};
const p = (
    key: string,
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    cpuOnly = false,
): CursorParameter => ({ key, label, min, max, step, default: value, cpuOnly });

export const CURSOR_COMMON_SCHEMA = [p('cursorEnabled', 'Cursor interaction', 0, 1, 1, 0)] as const;

/** The sole cursor effect. Radius, falloff, build-up and decay only affect the persistent CPU texture. */
export const CURSOR_EFFECT_GROUPS = [
    [
        'Density pressure',
        'cursorDensityPressureEnabled',
        [
            p('cursorDensityRadius', 'Radius', 0.02, 1, 0.01, 0.22, true),
            p('cursorDensityPressureFalloff', 'Falloff', 0, 8, 0.05, 1, true),
            p('cursorDensityStrength', 'Density strength', -3, 3, 0.01, 1),
            p('cursorDensityBuildUp', 'Build-up time', 0, 2, 0.01, 0.4, true),
            p('cursorDensityDecay', 'Decay', 0.01, 5, 0.01, 0.7, true),
        ],
    ],
] as const;

const enabled = (key: string): CursorParameter => p(key, 'Enabled', 0, 1, 1, 1);
const densityGroup = CURSOR_EFFECT_GROUPS[0];
export const CURSOR_PARAMETER_SCHEMA = [
    ...CURSOR_COMMON_SCHEMA,
    enabled(densityGroup[1]),
    ...densityGroup[2],
] as CursorParameter[];
export const CURSOR_PARAMETER_KEYS = CURSOR_PARAMETER_SCHEMA.map(({ key }) => key);
export const CURSOR_UNIFORM_PARAMETER_SCHEMA = CURSOR_PARAMETER_SCHEMA.filter(({ cpuOnly }) => !cpuOnly);
