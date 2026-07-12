export type CursorParameter = { key: string; label: string; min: number; max: number; step: number; default: number };
const p = (key: string, label: string, min: number, max: number, step: number, value: number): CursorParameter => ({
    key,
    label,
    min,
    max,
    step,
    default: value,
});
const enabled = (key: string) => p(key, 'Enabled', 0, 1, 1, 0);

export const CURSOR_COMMON_SCHEMA = [
    p('cursorEnabled', 'Cursor interaction', 0, 1, 1, 0),
    p('cursorRadius', 'Radius', 0.01, 2, 0.01, 0.3),
    p('cursorFalloff', 'Falloff', 0.1, 8, 0.1, 2),
    p('cursorSpeedReference', 'Speed reference', 0.01, 10, 0.01, 1),
    p('cursorTrailLength', 'Trail length', 1, 16, 1, 16),
    p('cursorTrailSpacing', 'Trail spacing', 0.001, 0.25, 0.001, 0.015),
    p('cursorTrailDecay', 'Trail decay', 0.05, 10, 0.05, 2),
] as const;

export const CURSOR_EFFECT_GROUPS = [
    ['Fluid push', 'cursorFluidPushEnabled', [p('cursorFluidPushStrength', 'Strength', -3, 3, 0.01, 1)]],
    ['Vortex', 'cursorVortexEnabled', [p('cursorVortexStrength', 'Strength', -6, 6, 0.01, 1)]],
    ['Attractor', 'cursorAttractorEnabled', [p('cursorAttractorStrength', 'Strength', -3, 3, 0.01, 1)]],
    ['Repulsor', 'cursorRepulsorEnabled', [p('cursorRepulsorStrength', 'Strength', -3, 3, 0.01, 1)]],
    ['Depth pressure', 'cursorDepthPressureEnabled', [p('cursorDepthPressureStrength', 'Strength', -3, 3, 0.01, 1)]],
    ['Scale lens', 'cursorScaleLensEnabled', [p('cursorScaleLensStrength', 'Strength', -2, 2, 0.01, 0.5)]],
    [
        'Turbulence injection',
        'cursorTurbulenceEnabled',
        [
            p('cursorTurbulenceStrength', 'Strength', 0, 3, 0.01, 0.5),
            p('cursorTurbulenceScale', 'Scale', 0.1, 20, 0.1, 4),
        ],
    ],
    ['Directional alignment', 'cursorAlignmentEnabled', [p('cursorAlignmentStrength', 'Strength', -3, 3, 0.01, 1)]],
    [
        'Density pressure',
        'cursorDensityPressureEnabled',
        [
            p('cursorDensityPressureStrength', 'Strength', -3, 3, 0.01, 1),
            p('cursorDensityPressureTrailAmount', 'Trail amount', 0, 1, 0.01, 1),
            p('cursorDensityPressureTrailDecay', 'Trail decay', 0.01, 10, 0.01, 2),
            p('cursorDensityPressureStillFade', 'Still fade / head decay', 0.1, 8, 0.1, 1),
        ],
    ],
    [
        'Elastic wake',
        'cursorElasticWakeEnabled',
        [
            p('cursorElasticWakeStrength', 'Strength', -3, 3, 0.01, 1),
            p('cursorElasticWakeFrequency', 'Frequency', 0.1, 30, 0.1, 8),
            p('cursorElasticWakeDamping', 'Damping', 0.01, 10, 0.01, 2),
        ],
    ],
    ['Bulge', 'cursorBulgeEnabled', [p('cursorBulgeStrength', 'Strength', -2, 2, 0.01, 0.5)]],
    [
        'Directional warp',
        'cursorDirectionalWarpEnabled',
        [p('cursorDirectionalWarpStrength', 'Strength', -3, 3, 0.01, 1)],
    ],
    [
        'Brightness / density gradient',
        'cursorBrightnessGradientEnabled',
        [p('cursorBrightnessGradientStrength', 'Strength', -3, 3, 0.01, 1)],
    ],
    [
        'Click displacement',
        'cursorClickEnabled',
        [
            p('cursorClickDisplacement', 'Displacement', -3, 3, 0.01, 1),
            p('cursorClickDensityRipple', 'Density ripple', -3, 3, 0.01, 1),
            p('cursorClickRadius', 'Radius', 0.01, 2, 0.01, 0.4),
            p('cursorClickFrequency', 'Frequency', 0.1, 30, 0.1, 8),
            p('cursorClickSpeed', 'Speed', 0.01, 10, 0.01, 1),
            p('cursorClickDecay', 'Decay', 0.01, 10, 0.01, 2),
            p('cursorClickPolarity', 'Polarity', -1, 1, 1, 1),
        ],
    ],
] as const;

export const CURSOR_PARAMETER_SCHEMA = [
    ...CURSOR_COMMON_SCHEMA,
    ...CURSOR_EFFECT_GROUPS.flatMap(([, toggle, values]) => [enabled(toggle), ...values]),
] as CursorParameter[];
export const CURSOR_PARAMETER_KEYS = CURSOR_PARAMETER_SCHEMA.map(({ key }) => key);
