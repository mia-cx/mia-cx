import { FrameTelemetry, type FrameRollingSummary } from './telemetry';
import { ADJUSTMENT_LUT_SIZE, composeAdjustmentLut, isNeutralAdjustment } from './adjustments';
import defaultSettingsFixture from './default-settings.json';
import {
    leadingAdjustmentRegion,
    rendererStagePlan,
    type ColourEffect,
    type PostEffect,
    type PostEffectKind,
} from './pipeline';
import { RGB_COLOUR_KINDS, isNeutralRgb, isRgbColour, type CubeLut, type RgbColourEffect } from './colour-effects';

const canonicalParameterDefaults = defaultSettingsFixture.settings.parameters;
const withCanonicalDefaults = <T extends readonly { key: string; default: number }[]>(schema: T): T =>
    schema.map((parameter) => ({
        ...parameter,
        default: (canonicalParameterDefaults as Record<string, number>)[parameter.key] ?? parameter.default,
    })) as unknown as T;

const FIELD_PARAMETER_SCHEMA_BASE = [
    { key: 'fieldScale', label: 'Base field size', min: 32, max: 2048, step: 1, default: 1007 },
    { key: 'flowStretch', label: 'Flow stretch', min: 0.35, max: 2.5, step: 0.01, default: 2.5 },
    { key: 'billowAmount', label: 'Cloud amount', min: -2, max: 2, step: 0.01, default: 1 },
    { key: 'ridgeAmount', label: 'Ribbon amount', min: -2, max: 2, step: 0.01, default: 2 },
    { key: 'ridgeSharpness', label: 'Ribbon sharpness', min: 0.4, max: 4, step: 0.01, default: 4 },
    { key: 'baseBlendMode', label: 'Blend mode', min: 0, max: 14, step: 1, default: 2 },
    { key: 'warpScale', label: 'Warp scale', min: 0.2, max: 2.5, step: 0.01, default: 0.2 },
    { key: 'warpStrength', label: 'Warp strength', min: 0, max: 1.5, step: 0.01, default: 0 },
    { key: 'secondaryEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 1 },
    { key: 'secondaryScale', label: 'Scale', min: 0, max: 2, step: 0.01, default: 0.45 },
    { key: 'secondaryCloudAmount', label: 'Cloud amount', min: -2, max: 2, step: 0.01, default: -0.25 },
    { key: 'secondaryRibbonAmount', label: 'Ribbon amount', min: -2, max: 2, step: 0.01, default: -1 },
    { key: 'secondaryRibbonSharpness', label: 'Ribbon sharpness', min: 0.4, max: 4, step: 0.01, default: 4 },
    { key: 'secondaryBlendMode', label: 'Cloud blend mode', min: 0, max: 14, step: 1, default: 2 },
    { key: 'secondaryRibbonBlendMode', label: 'Ribbon blend mode', min: 0, max: 14, step: 1, default: 2 },
    { key: 'thresholdEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 1 },
    { key: 'threshold', label: 'Threshold', min: 0.05, max: 0.95, step: 0.01, default: 0.5 },
    { key: 'thresholdSoftness', label: 'Threshold softness', min: 0.01, max: 0.5, step: 0.01, default: 0.5 },
    { key: 'finalContrast', label: 'Final contrast', min: 0.2, max: 3, step: 0.01, default: 1.8 },
    { key: 'animationSpeed', label: 'Animation speed', min: 0, max: 3, step: 0.01, default: 0.45 },
    { key: 'centerDarkness', label: 'Center darkness', min: 0, max: 1.5, step: 0.01, default: 0.6 },
    { key: 'centerWidth', label: 'Center width', min: 0.1, max: 2.5, step: 0.01, default: 0.75 },
    { key: 'centerHeight', label: 'Center height', min: 0.1, max: 2.5, step: 0.01, default: 0.85 },
    { key: 'centerRoundness', label: 'Center roundness', min: 2, max: 12, step: 0.1, default: 4.7 },
    { key: 'centerSoftness', label: 'Center softness', min: 0.01, max: 1.5, step: 0.01, default: 1.5 },
] as const;
export const FIELD_PARAMETER_SCHEMA = withCanonicalDefaults(FIELD_PARAMETER_SCHEMA_BASE);

export const OCTAVE_COUNT = 5;
export const GPU_TIMING_SAMPLE_INTERVAL = 30;
export const MAX_RENDER_PASSES = 2 * OCTAVE_COUNT + 32;
const GPU_QUERY_COUNT = MAX_RENDER_PASSES * 2;
export interface GpuTimingStats {
    totalMs: number;
    fieldMs: number;
    colourMs: number;
    postMs: number;
    octavesMs: number;
    presentMs: number;
    /** Legacy aliases retained for consumers of the original telemetry API. */
    baseMs: number;
    blurMs: number;
    octaveMs: number;
    displayMs: number;
    passes: Array<{ label: string; ms: number }>;
}
/** Aggregate WebGPU's nanosecond timestamps, safely treating malformed pairs as zero. */
export function aggregateGpuTimestamps(timestamps: ArrayLike<bigint>, labels: readonly string[]): GpuTimingStats {
    const passes = labels.map((label, i) => {
        const begin = timestamps[i * 2],
            end = timestamps[i * 2 + 1];
        const ms = begin !== undefined && end !== undefined && end >= begin ? Number(end - begin) / 1_000_000 : 0;
        return { label, ms: Number.isFinite(ms) ? ms : 0 };
    });
    const sum = (...prefixes: string[]) =>
        passes.reduce((n, pass) => n + (prefixes.some((prefix) => pass.label.startsWith(prefix)) ? pass.ms : 0), 0);
    const fieldMs = sum('base', 'field-materialize');
    const colourMs = sum('colour:');
    const postMs = sum('post:');
    const blurMs = sum('blur');
    const octaveMs = sum('octave');
    const presentMs = sum('display');
    return {
        totalMs: passes.reduce((n, pass) => n + pass.ms, 0),
        fieldMs,
        colourMs,
        postMs,
        octavesMs: blurMs + octaveMs,
        presentMs,
        baseMs: fieldMs,
        blurMs,
        octaveMs,
        displayMs: presentMs,
        passes,
    };
}
const noiseDefaults = Array<number>(OCTAVE_COUNT).fill(0.005);
const smoothnessDefaults = [0.85, 1, 0.5, 1, 1];
const distanceDefaults = [0.5, 0.1, 2, 1, 2];
const blurDefaults = [0, 0.5, 0.3, 0.3, 0.1];
const OCTAVE_PARAMETER_SCHEMA_BASE = Array.from({ length: OCTAVE_COUNT }, (_, index) => {
    const octave = index + 1;
    return [
        {
            key: `octave${octave}Noise`,
            label: 'Noise amount',
            min: 0,
            max: 0.5,
            step: 0.005,
            default: noiseDefaults[index],
        },
        { key: `octave${octave}Threshold`, label: 'Threshold', min: -0.4, max: 0.4, step: 0.01, default: 0 },
        {
            key: `octave${octave}Smoothness`,
            label: 'Diffusion smoothness',
            min: 0,
            max: 1,
            step: 0.01,
            default: smoothnessDefaults[index],
        },
        {
            key: `octave${octave}Distance`,
            label: 'Diffusion distance',
            min: 0,
            max: 6,
            step: 0.05,
            default: distanceDefaults[index],
        },
    ];
});
export const OCTAVE_PARAMETER_SCHEMA = OCTAVE_PARAMETER_SCHEMA_BASE.map((group) => withCanonicalDefaults(group));
const OCTAVE_PIXELATE_SCHEMA_BASE = Array.from({ length: OCTAVE_COUNT }, (_, index) => ({
    key: `octave${index + 1}Pixelate` as `octave${number}Pixelate`,
    label: 'Pixelate canvas',
    min: 0,
    max: 1,
    step: 1,
    default: 0,
}));
export const OCTAVE_PIXELATE_SCHEMA = withCanonicalDefaults(OCTAVE_PIXELATE_SCHEMA_BASE);
const OCTAVE_BLUR_SCHEMA_BASE = Array.from({ length: OCTAVE_COUNT }, (_, index) => ({
    key: `octave${index + 1}BlurRadius` as `octave${number}BlurRadius`,
    label: 'Pre-blur radius',
    min: 0,
    max: 2,
    step: 0.01,
    default: blurDefaults[index],
}));
export const OCTAVE_BLUR_SCHEMA = withCanonicalDefaults(OCTAVE_BLUR_SCHEMA_BASE);
export const POST_PARAMETER_SCHEMA = [
    { key: 'colorGradeEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'exposure', label: 'Exposure', min: -4, max: 4, step: 0.01, default: 0 },
    { key: 'temperature', label: 'Temperature (K)', min: 3500, max: 10000, step: 50, default: 6500 },
    { key: 'tint', label: 'Tint', min: -1, max: 1, step: 0.01, default: 0 },
    { key: 'contrast', label: 'Contrast', min: -1, max: 1, step: 0.01, default: 0 },
    { key: 'saturation', label: 'Saturation', min: -1, max: 2, step: 0.01, default: 0 },
    { key: 'vibrance', label: 'Vibrance', min: -1, max: 1, step: 0.01, default: 0 },
    { key: 'shadows', label: 'Shadows', min: -1, max: 1, step: 0.01, default: 0 },
    { key: 'highlights', label: 'Highlights', min: -1, max: 1, step: 0.01, default: 0 },
    { key: 'godRaysEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'godRaysAmount', label: 'Distance', min: -100, max: 100, step: 1, default: 0 },
    { key: 'godRaysIntensity', label: 'Intensity', min: 0, max: 3, step: 0.01, default: 0 },
    { key: 'godRaysThreshold', label: 'Threshold', min: 0, max: 2, step: 0.01, default: 0.75 },
    { key: 'godRaysSoftness', label: 'Softness', min: 0, max: 1, step: 0.01, default: 0.25 },
    { key: 'godRaysCenterX', label: 'Center X', min: -2, max: 2, step: 0.01, default: 0 },
    { key: 'godRaysCenterY', label: 'Center Y', min: -2, max: 2, step: 0.01, default: 0 },
    { key: 'godRaysSamples', label: 'Samples', min: 64, max: 128, step: 1, default: 64 },
    { key: 'bloomEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'bloomThreshold', label: 'Threshold', min: 0, max: 2, step: 0.01, default: 0.75 },
    { key: 'bloomKnee', label: 'Softness', min: 0, max: 1, step: 0.01, default: 0.25 },
    { key: 'bloomIntensity', label: 'Intensity', min: 0, max: 3, step: 0.01, default: 0 },
    { key: 'bloomRadius', label: 'Radius', min: 0, max: 2, step: 0.01, default: 0.6 },
    { key: 'glowEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'glowIntensity', label: 'Intensity', min: 0, max: 3, step: 0.01, default: 0 },
    { key: 'glowHue', label: 'Hue', min: 0, max: 1, step: 0.01, default: 0.08 },
    { key: 'chromaticAberration', label: 'Chromatic aberration', min: 0, max: 12, step: 0.1, default: 0 },
    { key: 'vignetteAmount', label: 'Vignette', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'vignetteSoftness', label: 'Vignette softness', min: 0.01, max: 1, step: 0.01, default: 0.35 },
    { key: 'lensDistortion', label: 'Lens distortion', min: -0.5, max: 0.5, step: 0.005, default: 0 },
    { key: 'sharpen', label: 'Sharpen', min: 0, max: 2, step: 0.01, default: 0 },
    { key: 'filmGrainAmount', label: 'Film grain', min: 0, max: 0.3, step: 0.005, default: 0 },
    { key: 'filmGrainSize', label: 'Grain size', min: 0.5, max: 4, step: 0.1, default: 1 },
    { key: 'godRaysBlendMode', label: 'Blend mode', min: 0, max: 14, step: 1, default: 0 },
    { key: 'bloomBlendMode', label: 'Blend mode', min: 0, max: 14, step: 1, default: 0 },
    { key: 'glowBlendMode', label: 'Blend mode', min: 0, max: 14, step: 1, default: 0 },
    { key: 'chromaticAberrationEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 1 },
    { key: 'vignetteEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 1 },
    { key: 'lensDistortionEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 1 },
    { key: 'sharpenEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 1 },
    { key: 'filmGrainEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 1 },
    { key: 'halationEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'halationAmount', label: 'Amount', min: 0, max: 2, step: 0.01, default: 0 },
    { key: 'halationRadius', label: 'Radius', min: 1, max: 32, step: 1, default: 8 },
    { key: 'halationThreshold', label: 'Threshold', min: 0, max: 2, step: 0.01, default: 0.7 },
    { key: 'streakEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'streakAmount', label: 'Amount', min: 0, max: 2, step: 0.01, default: 0 },
    { key: 'streakLength', label: 'Length', min: 1, max: 64, step: 1, default: 24 },
    { key: 'streakAngle', label: 'Angle', min: -3.14, max: 3.14, step: 0.01, default: 0 },
    { key: 'streakThreshold', label: 'Threshold', min: 0, max: 2, step: 0.01, default: 0.8 },
    { key: 'starburstEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'starburstAmount', label: 'Amount', min: 0, max: 2, step: 0.01, default: 0 },
    { key: 'starburstRadius', label: 'Radius', min: 1, max: 32, step: 1, default: 12 },
    { key: 'starburstBlades', label: 'Blades', min: 2, max: 12, step: 1, default: 6 },
    { key: 'starburstThreshold', label: 'Threshold', min: 0, max: 2, step: 0.01, default: 0.8 },
    { key: 'lensDirtEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'lensDirtAmount', label: 'Amount', min: 0, max: 2, step: 0.01, default: 0 },
    { key: 'lensDirtScale', label: 'Scale', min: 1, max: 30, step: 0.1, default: 8 },
    { key: 'lensDirtThreshold', label: 'Threshold', min: 0, max: 2, step: 0.01, default: 0.7 },
    { key: 'lensGhostEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'lensGhostAmount', label: 'Amount', min: 0, max: 2, step: 0.01, default: 0 },
    { key: 'lensGhostCount', label: 'Ghosts', min: 1, max: 8, step: 1, default: 4 },
    { key: 'lensGhostSpacing', label: 'Spacing', min: 0.1, max: 2, step: 0.01, default: 0.7 },
    { key: 'bokehEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'bokehAmount', label: 'Amount', min: 0, max: 2, step: 0.01, default: 0 },
    { key: 'bokehRadius', label: 'Radius', min: 1, max: 32, step: 1, default: 8 },
    { key: 'bokehSamples', label: 'Samples', min: 4, max: 32, step: 1, default: 16 },
    { key: 'bokehBlades', label: 'Blades', min: 3, max: 12, step: 1, default: 6 },
    { key: 'bokehThreshold', label: 'Threshold', min: 0, max: 2, step: 0.01, default: 0.8 },
    { key: 'gateWeaveEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'gateWeaveAmount', label: 'Amount', min: 0, max: 20, step: 0.1, default: 0 },
    { key: 'gateWeaveSpeed', label: 'Speed', min: 0, max: 5, step: 0.1, default: 1 },
    { key: 'filmDamageEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'filmDamageAmount', label: 'Amount', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'filmDust', label: 'Dust', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'filmScratches', label: 'Scratches', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'filmFlicker', label: 'Flicker', min: 0, max: 1, step: 0.01, default: 0.2 },
    { key: 'radialBlurEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'radialBlurAmount', label: 'Amount', min: 0, max: 0.2, step: 0.001, default: 0 },
    { key: 'radialBlurSamples', label: 'Samples', min: 2, max: 32, step: 1, default: 12 },
    { key: 'spinBlurEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'spinBlurAmount', label: 'Amount', min: 0, max: 0.3, step: 0.001, default: 0 },
    { key: 'spinBlurSamples', label: 'Samples', min: 2, max: 32, step: 1, default: 12 },
    { key: 'directionalBlurEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'directionalBlurAmount', label: 'Amount', min: 0, max: 50, step: 0.1, default: 0 },
    { key: 'directionalBlurAngle', label: 'Angle', min: -3.14, max: 3.14, step: 0.01, default: 0 },
    { key: 'directionalBlurSamples', label: 'Samples', min: 2, max: 32, step: 1, default: 12 },
    { key: 'rollingShutterEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'rollingShutterAmount', label: 'Amount', min: 0, max: 0.2, step: 0.001, default: 0 },
    { key: 'rollingShutterSpeed', label: 'Speed', min: 0, max: 5, step: 0.1, default: 1 },
    { key: 'heatHazeEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'heatHazeAmount', label: 'Amount', min: 0, max: 0.1, step: 0.001, default: 0 },
    { key: 'heatHazeScale', label: 'Scale', min: 1, max: 100, step: 1, default: 30 },
    { key: 'heatHazeSpeed', label: 'Speed', min: 0, max: 5, step: 0.1, default: 1 },
    { key: 'prismEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'prismAmount', label: 'Amount', min: 0, max: 30, step: 0.1, default: 0 },
    { key: 'prismAngle', label: 'Angle', min: -3.14, max: 3.14, step: 0.01, default: 0 },
    { key: 'kaleidoscopeEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'kaleidoscopeAmount', label: 'Mix', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'kaleidoscopeSegments', label: 'Segments', min: 2, max: 20, step: 1, default: 6 },
    { key: 'datamoshEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'datamoshAmount', label: 'Amount', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'datamoshBlockSize', label: 'Block size', min: 2, max: 64, step: 1, default: 16 },
    { key: 'scanlineEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 0 },
    { key: 'scanlineAmount', label: 'Amount', min: 0, max: 0.2, step: 0.001, default: 0 },
    { key: 'scanlineFrequency', label: 'Frequency', min: 1, max: 500, step: 1, default: 120 },
    { key: 'scanlineSpeed', label: 'Speed', min: 0, max: 10, step: 0.1, default: 1 },
    { key: 'godRaysFalloff', label: 'Falloff', min: 0, max: 16, step: 0.1, default: 4 },
] as const;

/** Numeric order is persisted; append only. */
export const FIELD_BLEND_MODES = [
    'Add',
    'Subtract',
    'Screen',
    'Overlay',
    'Multiply',
    'Difference',
    'Negation',
    'Exclusion',
    'Darken',
    'Lighten',
    'Color dodge',
    'Color burn',
    'Hard light',
    'Soft light',
    'Divide',
] as const;
/** Numeric order is persisted; append only. */
export const POST_BLEND_MODES = [
    'Add',
    'Screen',
    'Overlay',
    'Soft light',
    'Multiply',
    'Difference',
    'Negation',
    'Exclusion',
    'Darken',
    'Lighten',
    'Color dodge',
    'Color burn',
    'Hard light',
    'Subtract',
    'Divide',
] as const;
export const PARAMETER_SCHEMA = [
    ...FIELD_PARAMETER_SCHEMA,
    ...OCTAVE_PARAMETER_SCHEMA.flat(),
    ...OCTAVE_PIXELATE_SCHEMA,
    ...OCTAVE_BLUR_SCHEMA,
    ...POST_PARAMETER_SCHEMA,
];
export type ParameterKey = (typeof PARAMETER_SCHEMA)[number]['key'];
export type ShaderParameters = Record<ParameterKey, number>;
export const defaultParameters = (): ShaderParameters =>
    Object.fromEntries(PARAMETER_SCHEMA.map(({ key, default: value }) => [key, value])) as ShaderParameters;

export interface RenderOptions {
    seed: number;
    dprCap: number;
    renderScale: number;
    parameters: ShaderParameters;
    colour: ColourEffect[];
    post: PostEffect[];
    lutAssets?: Record<string, CubeLut>;
}

export function renderSize(width: number, height: number, dpr: number, cap: number) {
    return {
        width: Math.max(1, Math.floor(width * Math.min(dpr, cap))),
        height: Math.max(1, Math.floor(height * Math.min(dpr, cap))),
    };
}

export function scaledSize(width: number, height: number, scale: number) {
    return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

/** Effect-space pixel sizes; every image pass itself remains full resolution. */
export function octavePixelSizes() {
    // The first destructive tap comes from the coarsest stage; later taps add progressively finer pixels.
    return Array.from({ length: OCTAVE_COUNT }, (_, index) => 2 ** (OCTAVE_COUNT - 1 - index));
}

/** The base and five octave effect stages all have the same full render dimensions. */
export function fullResolutionPassSizes(width: number, height: number, renderScale: number) {
    const size = scaledSize(width, height, renderScale);
    return Array.from({ length: OCTAVE_COUNT + 1 }, () => ({ ...size }));
}

export const UNIFORM_FLOATS = 180;
export function packUniform(
    resolution: [number, number],
    time: number,
    seed: number,
    parameters: ShaderParameters,
    octaveIndex = 0,
    frameIndex = 0,
) {
    const data = new Float32Array(UNIFORM_FLOATS);
    data.set([resolution[0], resolution[1], time, seed, ...FIELD_PARAMETER_SCHEMA.map(({ key }) => parameters[key])]);
    data[29] = octaveIndex;
    data[30] = OCTAVE_PIXELATE_SCHEMA.reduce(
        (mask, { key }, index) => mask + (parameters[key] >= 0.5 ? 2 ** index : 0),
        0,
    );
    data[31] = frameIndex;
    data.set(
        OCTAVE_PARAMETER_SCHEMA.flatMap((group) => group.map(({ key }) => parameters[key])),
        32,
    );
    data.set(
        OCTAVE_BLUR_SCHEMA.map(({ key }) => parameters[key]),
        52,
    );
    data.set(
        POST_PARAMETER_SCHEMA.map(({ key }) => parameters[key]),
        60,
    );
    return data;
}

export function octaveEffectIsActive(parameters: ShaderParameters, index: number) {
    const settings = OCTAVE_PARAMETER_SCHEMA[index];
    return (
        parameters[OCTAVE_PIXELATE_SCHEMA[index].key] >= 0.5 ||
        parameters[settings[0].key] !== 0 ||
        parameters[settings[1].key] !== 0 ||
        parameters[settings[3].key] !== 0
    );
}

export function octaveBlurIsActive(parameters: ShaderParameters, index: number) {
    return parameters[OCTAVE_BLUR_SCHEMA[index].key] > 0;
}

export function godRaysIsActive(parameters: ShaderParameters) {
    return parameters.godRaysEnabled >= 0.5 && parameters.godRaysAmount !== 0 && parameters.godRaysIntensity !== 0;
}
export function datamoshIsActive(parameters: ShaderParameters) {
    return parameters.datamoshEnabled >= 0.5 && parameters.datamoshAmount !== 0;
}

/** Stable identity for bind groups whose resources are all renderer-owned. */
export function bindGroupCacheKey(pipelineIndex: number, sourceTextureIndex: number | undefined, passIndex: number) {
    return `${pipelineIndex}:${sourceTextureIndex ?? 'none'}:${passIndex}`;
}

export function advanceSimulationTime(time: number, deltaSeconds: number, speed: number) {
    return time + deltaSeconds * speed;
}

export const COMMON_SHADER_SOURCE = /* wgsl */ `
struct U {
 resolution: vec2f, time: f32, seed: f32,
 fieldScale: f32, flowStretch: f32, billowAmount: f32, ridgeAmount: f32,
 ridgeSharpness: f32, baseBlendMode: f32, warpScale: f32, warpStrength: f32,
 secondaryEnabled: f32, secondaryScale: f32, secondaryCloudAmount: f32,
 secondaryRibbonAmount: f32, secondaryRibbonSharpness: f32, secondaryBlendMode: f32,
 secondaryRibbonBlendMode: f32,
 thresholdEnabled: f32, threshold: f32, thresholdSoftness: f32, finalContrast: f32,
 animationSpeed: f32,
 centerDarkness: f32, centerWidth: f32, centerHeight: f32, centerRoundness: f32,
 centerSoftness: f32, octaveIndex: f32, octavePixelationMask: f32, frameIndex: f32,
 octaves: array<vec4f, 5>,
 blurRadii: array<vec4f, 2>, post: array<vec4f, 30>
};
@group(0) @binding(0) var<uniform> u: U;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
    let p = array(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3)); return vec4f(p[i],0,1);
}
fn hash3(p: vec3f, seedSalt: f32) -> f32 {
    return fract(sin(dot(p,vec3f(127.1,311.7,74.7)) + u.seed*19.19 + seedSalt*53.17)*43758.5453);
}
fn simplexGradient(lattice: vec3f, seedSalt: f32) -> vec3f {
    let gradients=array<vec3f,12>(
        vec3f(1,1,0),vec3f(-1,1,0),vec3f(1,-1,0),vec3f(-1,-1,0),
        vec3f(1,0,1),vec3f(-1,0,1),vec3f(1,0,-1),vec3f(-1,0,-1),
        vec3f(0,1,1),vec3f(0,-1,1),vec3f(0,1,-1),vec3f(0,-1,-1)
    );
    return gradients[u32(floor(hash3(lattice,seedSalt)*12.))];
}
fn simplexCorner(lattice: vec3f, offset: vec3f, seedSalt: f32) -> f32 {
    let kernel=max(.6-dot(offset,offset),0.);
    return kernel*kernel*kernel*kernel*dot(simplexGradient(lattice,seedSalt),offset);
}
fn noise3(p: vec3f, seedSalt: f32) -> f32 {
    // Isotropic simplex gradient noise: all axes share one tetrahedral lattice and compact C2 kernel.
    let skew=(p.x+p.y+p.z)/3.;
    let cell=floor(p+skew);
    let unskew=(cell.x+cell.y+cell.z)/6.;
    let x0=p-(cell-unskew);
    let first=select(vec3f(0),vec3f(1),x0>=x0.yzx);
    let second=select(vec3f(0),vec3f(1),x0>x0.zxy);
    let i1=min(first,second);
    let i2=max(first,second);
    let x1=x0-i1+vec3f(1./6.);
    let x2=x0-i2+vec3f(1./3.);
    let x3=x0-vec3f(.5);
    let sum=simplexCorner(cell,x0,seedSalt)+simplexCorner(cell+i1,x1,seedSalt)+simplexCorner(cell+i2,x2,seedSalt)+simplexCorner(cell+vec3f(1),x3,seedSalt);
    // Conventional 32x simplex normalization, remapped approximately from [-1,1] to [0,1].
    return .5+16.*sum;
}
fn noise3v(p: vec2f, z: f32) -> vec2f {
    return vec2f(noise3(vec3f(p,z),101.),noise3(vec3f(p+vec2f(17.7,43.2),z+11.3),211.));
}
fn screen01(a: f32, b: f32) -> f32 { return 1.-(1.-clamp(a,0.,1.))*(1.-clamp(b,0.,1.)); }
fn overlay01(backdrop: f32, source: f32) -> f32 {
    let a=clamp(backdrop,0.,1.); let b=clamp(source,0.,1.);
    return select(2.*a*b,1.-2.*(1.-a)*(1.-b),a>.5);
}
fn softLight01(a: f32, b: f32) -> f32 {
    return select(a-(1.-2.*b)*a*(1.-a),a+(2.*b-1.)*(sqrt(a)-a),b>.5);
}
fn extendedBlend01(a: f32, b: f32, mode: f32) -> f32 {
    if(mode<4.5) { return a*b; }
    if(mode<5.5) { return abs(a-b); }
    if(mode<6.5) { return 1.-abs(1.-a-b); }
    if(mode<7.5) { return a+b-2.*a*b; }
    if(mode<8.5) { return min(a,b); }
    if(mode<9.5) { return max(a,b); }
    if(mode<10.5) { return select(1.,min(1.,a/max(1.-b,.00001)),b<1.); }
    if(mode<11.5) { return select(0.,1.-min(1.,(1.-a)/max(b,.00001)),b>0.); }
    if(mode<12.5) { return overlay01(b,a); }
    if(mode<13.5) { return softLight01(a,b); }
    return select(1.,a/max(b,.00001),b>0.);
}
fn blendSigned(backdrop: f32, source: f32, mode: f32) -> f32 {
    if(source==0.) { return backdrop; }
    if(mode<.5) { return backdrop+source; }
    if(mode<1.5) { return backdrop-source; }
    if(mode<2.5) {
        // Signed screen: equal signs screen magnitudes; a negative source multiplicatively
        // darkens a positive backdrop, retaining excess strength as signed subtraction.
        if(source<0. && backdrop>0.) { let m=-source; return backdrop*(1.-min(m,1.))-max(m-1.,0.); }
        if(source>=0. && backdrop<0.) { return backdrop+source; }
        let sign=select(-1.,1.,backdrop+source>=0.);
        return sign*screen01(abs(backdrop),abs(source));
    }
    if(mode>=3.5) {
        // Apply the standard unsigned operation by signed source strength. Negative field
        // contributions reverse the operation, and magnitudes above one remain effective.
        let a=clamp(backdrop,0.,1.); let strength=min(abs(source),1.); let b=strength;
        let blended=extendedBlend01(a,b,mode); let direction=select(-1.,1.,source>0.);
        return backdrop+direction*(blended-a)*strength+direction*max(abs(source)-1.,0.);
    }
    // Standard [0,1] overlay, mixed by signed source strength so zero remains an identity.
    let strength=min(abs(source),1.);
    let operand=select(clamp(source,0.,1.),1.-clamp(-source,0.,1.),source<0.);
    let overlaid=overlay01(backdrop,operand);
    return mix(backdrop,overlaid,strength)-select(0.,max(-source-1.,0.),source<0.);
}
fn smoothAbsFold(value: f32) -> f32 {
    // 0.001 removes the derivative cusp at the Cloud fold with negligible Add-mode displacement.
    return sqrt(value*value+0.000001)-0.001;
}
`;

export const BASE_SHADER_SOURCE =
    COMMON_SHADER_SOURCE +
    /* wgsl */ `
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    var q=(pos.xy/u.resolution)*2.-1.; q.x*=u.resolution.x/u.resolution.y;
    let t=u.time;
    // Interpret field size against a 1080px reference height, not the render target's physical pixels.
    // The composition therefore stays stable across resolutions while higher-resolution targets add detail.
    let fieldPixel=q*(540./u.fieldScale);
    let flow=mat2x2f(.89,.45,-.45,.89)*vec2f(fieldPixel.x,fieldPixel.y*u.flowStretch);
    var warpOffset=vec2f(0.);
    let secondaryHasAmount=u.secondaryEnabled>=.5 && (u.secondaryCloudAmount!=0. || u.secondaryRibbonAmount!=0.);
    let fieldHasAmount=u.billowAmount!=0. || u.ridgeAmount!=0. || secondaryHasAmount;
    if(fieldHasAmount && u.warpStrength!=0.) {
        warpOffset=(noise3v(flow*u.warpScale,t*.11)-.5)*u.warpStrength;
    }
    let p=flow+warpOffset;
    let primaryPosition=vec3f(p,t*.075);
    var shaped=0.;
    if(u.billowAmount!=0.) {
        let cloud=smoothAbsFold(noise3(primaryPosition,307.)*2.-1.);
        shaped=cloud*u.billowAmount;
    }
    if(u.ridgeAmount!=0.) {
        let ribbonBase=1.-abs(noise3(primaryPosition,401.)*2.-1.);
        let ribbon=pow(clamp(ribbonBase,0.,1.),u.ridgeSharpness);
        shaped=blendSigned(shaped,ribbon*u.ridgeAmount,u.baseBlendMode);
    }
    var natural=shaped;
    if(u.secondaryEnabled>=.5 && (u.secondaryCloudAmount!=0. || u.secondaryRibbonAmount!=0.)) {
        let secondaryPosition=vec3f(p*u.secondaryScale+vec2f(13.7,-8.4)-warpOffset*.41,t*.12+7.1);
        if(u.secondaryCloudAmount!=0.) {
            let secondaryCloud=smoothAbsFold(noise3(secondaryPosition,503.)*2.-1.);
            natural=blendSigned(natural,secondaryCloud*u.secondaryCloudAmount,u.secondaryBlendMode);
        }
        if(u.secondaryRibbonAmount!=0.) {
            let secondaryRibbonBase=1.-abs(noise3(secondaryPosition,601.)*2.-1.);
            let secondaryRibbon=pow(clamp(secondaryRibbonBase,0.,1.),u.secondaryRibbonSharpness);
            natural=blendSigned(natural,secondaryRibbon*u.secondaryRibbonAmount,u.secondaryRibbonBlendMode);
        }
    }
    if(u.centerDarkness!=0.) {
        let centerPoint=abs(q/vec2f(u.centerWidth,u.centerHeight));
        let centerDistance=pow(pow(centerPoint.x,u.centerRoundness)+pow(centerPoint.y,u.centerRoundness),1./u.centerRoundness);
        let centerFeather=u.centerSoftness*.5;
        let center=1.-smoothstep(1.-centerFeather,1.+centerFeather,centerDistance);
        natural*=exp2(-center*u.centerDarkness*4.);
    }
    // Field shaping finishes here; recursive scatter/noise is the next destructive stage on top.
    if(u.thresholdEnabled<.5) { return vec4f(natural,0.,0.,1.); }
    let thresholdWidth=max(u.thresholdSoftness,fwidth(natural)*1.5);
    let thresholded=smoothstep(u.threshold-thresholdWidth,u.threshold+thresholdWidth,natural);
    return vec4f(thresholded,0.,0.,1.);
}`;

export const BLUR_SHADER_SOURCE =
    COMMON_SHADER_SOURCE +
    /* wgsl */ `
@group(0) @binding(1) var src: texture_2d<f32>; @group(0) @binding(2) var samp: sampler;
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let uv=pos.xy/u.resolution;
    let sourceSize=vec2f(textureDimensions(src));
    let radiusIndex=u32(u.octaveIndex);
    let radius=u.blurRadii[radiusIndex/4u][radiusIndex%4u];
    if(radius<=0.) { return vec4f(textureSample(src,samp,uv).rgb,1.); }
    // Four bilinearly filtered diagonal taps provide a compact, scale-relative Kawase blur.
    let octavePixelSize=exp2(4.-u.octaveIndex);
    let offset=vec2f(octavePixelSize*radius)/sourceSize;
    var value=textureSample(src,samp,uv+offset).rgb*.25;
    value+=textureSample(src,samp,uv+vec2f(-offset.x,offset.y)).rgb*.25;
    value+=textureSample(src,samp,uv+vec2f(offset.x,-offset.y)).rgb*.25;
    value+=textureSample(src,samp,uv-offset).rgb*.25;
    return vec4f(value,1.);
}`;

export const OCTAVE_SHADER_SOURCE =
    COMMON_SHADER_SOURCE +
    /* wgsl */ `
@group(0) @binding(1) var src: texture_2d<f32>; @group(0) @binding(2) var samp: sampler;
fn avalanche(value: u32) -> u32 {
    var x=value;
    x^=x>>16u; x*=0x7feb352du; x^=x>>15u; x*=0x846ca68bu; x^=x>>16u;
    return x;
}
fn tileHash(tile: vec2u, salt: u32) -> u32 {
    return avalanche((tile.x*0x9e3779b9u) ^ (tile.y*0x85ebca6bu) ^ (u32(u.seed)*0xc2b2ae35u) ^ salt);
}
fn scatterOffset(tile: vec2u, sampleIndex: u32, distance: f32, octaveFrameSalt: u32) -> vec2f {
    // Paint.NET Frosted Glass: one hash supplies an independent quantized direction and radius per sample.
    let directions=array<vec2f,16>(
        vec2f(1.,0.),vec2f(.9238795,.3826834),vec2f(.7071068,.7071068),vec2f(.3826834,.9238795),
        vec2f(0.,1.),vec2f(-.3826834,.9238795),vec2f(-.7071068,.7071068),vec2f(-.9238795,.3826834),
        vec2f(-1.,0.),vec2f(-.9238795,-.3826834),vec2f(-.7071068,-.7071068),vec2f(-.3826834,-.9238795),
        vec2f(0.,-1.),vec2f(.3826834,-.9238795),vec2f(.7071068,-.7071068),vec2f(.9238795,-.3826834)
    );
    let bits=tileHash(tile,octaveFrameSalt ^ (sampleIndex*0x165667b1u));
    let radius=f32(bits>>8u)*(1./16777215.)*distance;
    return directions[bits&15u]*radius;
}
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let uv=pos.xy/u.resolution;
    let sourceSize=vec2f(textureDimensions(src));
    let octave=u32(u.octaveIndex);
    let settings=u.octaves[octave];
    let pixel=vec2u(pos.xy);
    let tileShift=4u-octave;
    let octavePixelSizeU=1u<<tileShift;
    let tile=pixel>>vec2u(tileShift);
    let pixelationBit=(u32(u.octavePixelationMask)&(1u<<octave))!=0u;
    let octavePixelSize=f32(octavePixelSizeU);
    let tiledUv=(vec2f(tile)+.5)*octavePixelSize/sourceSize;
    let sourceUv=select(uv,tiledUv,pixelationBit);
    let sampleCount=u32(round(mix(1.,4.,settings.z)));
    // Radius zero is an exact identity operation: no random resampling and no accumulated softening.
    var scattered: vec3f;
    if(settings.w>0.) {
        scattered=vec3f(0.);
        let octaveFrameSalt=(octave*0x27d4eb2du) ^ (u32(u.frameIndex)*0x9e3779b9u);
        for(var sampleIndex=0u;sampleIndex<4u;sampleIndex++) {
            if(sampleIndex<sampleCount) {
                // Run Frosted Glass in this octave's virtual pixel grid. Every real pixel inside a tile
                // receives the same whole-tile displacement while retaining its local detail.
                let tileOffset=round(scatterOffset(tile,sampleIndex,settings.w,octaveFrameSalt));
                let offset=tileOffset*octavePixelSize;
                scattered+=textureSample(src,samp,sourceUv+offset/sourceSize).rgb;
            }
        }
        scattered/=f32(sampleCount);
    } else {
        scattered=textureSample(src,samp,sourceUv).rgb;
    }
    // Paint.NET's smoothness is sample count: 1–4 randomly displaced bilinear samples blended together.
    // Diffusion offsets and electrical noise are independently re-salted every rendered frame.
    // Literal noise is constant per effect-space tile, but independently salted for each rendered frame.
    var injected=scattered;
    if(settings.x!=0.) {
        let noiseSalt=(octave*0x27d4eb2du) ^ (u32(u.frameIndex)*0x165667b1u) ^ 0xa511e9b3u;
        let noiseBits=tileHash(tile,noiseSalt);
        let detail=f32(noiseBits)*(1./4294967295.)-.5;
        injected+=detail*settings.x;
    }
    if(settings.y==0.) { return vec4f(injected,1.); }
    let luminance=dot(max(injected,vec3f(0.)),vec3f(.2126,.7152,.0722));
    let thresholdWidth=max(.015,fwidth(luminance)*1.5);
    let thresholded=smoothstep(settings.y-thresholdWidth,settings.y+thresholdWidth,luminance);
    let scale=select(0.,thresholded/max(luminance,.000001),luminance>0.);
    return vec4f(injected*scale,1.);
}`;

export const GOD_RAYS_TEXTURE_FORMAT: GPUTextureFormat = 'rgba16float';
export const BLOOM_TEXTURE_FORMAT: GPUTextureFormat = 'rgba16float';

export const GOD_RAYS_SHADER_SOURCE =
    COMMON_SHADER_SOURCE +
    /* wgsl */ `
@group(0) @binding(1) var src:texture_2d<f32>; @group(0) @binding(2) var samp:sampler; @group(0) @binding(3) var adjustmentLut:texture_2d<f32>;
fn adjusted(v:f32)->vec3f { let f=clamp(v,0.,1.); if(u.blurRadii[1].w<=.5) { return vec3f(f); } let p=f*4095.; let lo=i32(floor(p)); let hi=min(lo+1,4095); return mix(textureLoad(adjustmentLut,vec2i(lo,0),0).rgb,textureLoad(adjustmentLut,vec2i(hi,0),0).rgb,p-f32(lo)); }
fn graded(v:f32)->vec3f {
 var rgb=adjusted(v);
 if(u.post[0].x>.5) { rgb*=exp2(u.post[0].y); let temp=(u.post[0].z-6500.)/2000.; rgb*=vec3f(1.+temp*.08,1.,1.-temp*.08); rgb+=vec3f(u.post[0].w*.25,u.post[0].w*.5,-u.post[0].w*.25); rgb=(rgb-.5)*(1.+u.post[1].x)+.5; let l=dot(rgb,vec3f(.2126,.7152,.0722)); let range=clamp(max(rgb.r,max(rgb.g,rgb.b))-min(rgb.r,min(rgb.g,rgb.b)),0.,1.); rgb=mix(vec3f(l),rgb,1.+u.post[1].y+u.post[1].z*(1.-range)); rgb+=u.post[1].w*(1.-smoothstep(0.,.5,l))+u.post[2].x*smoothstep(.5,1.,l); }
 return rgb;
}
@fragment fn fs(@builtin(position) pos:vec4f)->@location(0) vec4f {
 let startUv=pos.xy/u.resolution; let center=vec2f(.5)+u.post[3].zw*.5;
 // Paint.NET contracts the source vector by Amount/16384 for each of 64 iterations.
 // Sample the complete Paint.NET path, with optional oversampling for long rays.
 let contraction=max(1.-u.post[2].z/16384.,0.); let count=u32(round(u.post[4].x)); var sum=vec3f(0); var visible=0.;
 for(var i=0u;i<128u;i++) { if(i<count) {
  let progress=f32(i)/max(f32(count-1u),1.); let uv=center+(startUv-center)*pow(contraction,progress*64.);
  if(all(uv>=vec2f(0)) && all(uv<=vec2f(1))) {
   let v=pow(clamp(textureSampleLevel(src,samp,uv,0.).r,0.,1.),u.finalContrast); let rgb=graded(v); let luminance=dot(max(rgb,vec3f(0)),vec3f(.2126,.7152,.0722));
   let threshold=u.post[3].x; let softness=max(u.post[3].y,.00001); let weight=select(smoothstep(threshold-softness,threshold+softness,luminance),1.,threshold<=0.); let rayOffset=(uv-center)*vec2f(u.resolution.x/u.resolution.y,1.); let attenuation=1./(1.+u.post[26].z*dot(rayOffset,rayOffset)); sum+=rgb*weight*attenuation; visible+=1.;
  }
 } }
 if(visible==0.) { return vec4f(0,0,0,1); } return vec4f(sum/visible*u.post[2].w,1.);
}`;
export const DISPLAY_SHADER_SOURCE =
    COMMON_SHADER_SOURCE +
    /* wgsl */ `
@group(0) @binding(1) var src:texture_2d<f32>; @group(0) @binding(2) var samp:sampler;
@group(0) @binding(3) var adjustmentLut:texture_2d<f32>; @group(0) @binding(4) var bloom:texture_2d<f32>; @group(0) @binding(5) var godRays:texture_2d<f32>;
fn hueRotate(rgb:vec3f,h:f32)->vec3f {
 if(h==0.) { return rgb; }
 // Rotate YIQ chroma while retaining the sampled layer's Rec.601 luminance and color variation.
 let angle=h*6.28318530718; let y=dot(rgb,vec3f(.299,.587,.114)); let i=dot(rgb,vec3f(.596,-.274,-.322)); let q=dot(rgb,vec3f(.211,-.523,.312));
 let rotated=vec2f(i*cos(angle)-q*sin(angle),i*sin(angle)+q*cos(angle));
 return vec3f(y+.956*rotated.x+.621*rotated.y,y-.272*rotated.x-.647*rotated.y,y-1.106*rotated.x+1.703*rotated.y);
}
fn overlayChannel(base:f32,blend:f32)->f32 { return select(2.*base*blend,1.-2.*(1.-base)*(1.-blend),base>.5); }
fn softLightChannel(base:f32,blend:f32)->f32 { return select(base-(1.-2.*blend)*base*(1.-base),base+(2.*blend-1.)*(sqrt(base)-base),blend>.5); }
fn extendedLightChannel(a:f32,b:f32,mode:f32)->f32 {
 if(mode<4.5) { return a*b; } if(mode<5.5) { return abs(a-b); } if(mode<6.5) { return 1.-abs(1.-a-b); }
 if(mode<7.5) { return a+b-2.*a*b; } if(mode<8.5) { return min(a,b); } if(mode<9.5) { return max(a,b); }
 if(mode<10.5) { return select(1.,min(1.,a/max(1.-b,.00001)),b<1.); } if(mode<11.5) { return select(0.,1.-min(1.,(1.-a)/max(b,.00001)),b>0.); }
 if(mode<12.5) { return overlayChannel(b,a); } if(mode<13.5) { return a-b; } return select(1.,a/max(b,.00001),b>0.);
}
fn blendLight(base:vec3f,color:vec3f,amount:f32,mode:f32)->vec3f {
 if(amount==0.) { return base; } if(mode<.5) { return base+color*amount; }
 let bounded=clamp(base,vec3f(0),vec3f(1)); let excess=max(base-vec3f(1),vec3f(0));
 if(mode<1.5) { return 1.-(1.-bounded)*(1.-clamp(color*amount,vec3f(0),vec3f(1)))+excess; }
 let strength=clamp(amount,0.,1.); var blended:vec3f;
 if(mode<2.5) { blended=vec3f(overlayChannel(bounded.r,color.r),overlayChannel(bounded.g,color.g),overlayChannel(bounded.b,color.b)); }
 else if(mode<3.5) { blended=vec3f(softLightChannel(bounded.r,color.r),softLightChannel(bounded.g,color.g),softLightChannel(bounded.b,color.b)); }
 else { let c=clamp(color,vec3f(0),vec3f(1)); blended=vec3f(extendedLightChannel(bounded.r,c.r,mode),extendedLightChannel(bounded.g,c.g,mode),extendedLightChannel(bounded.b,c.b,mode)); }
 return mix(bounded,blended,strength)+excess;
}
fn blendLayer(base:vec3f,layer:vec3f,mode:f32)->vec3f { if(mode<.5) { return base+layer; } let strength=select(max(abs(layer.r),max(abs(layer.g),abs(layer.b))),max(layer.r,max(layer.g,layer.b)),mode<3.5); if(strength<=0.) { return base; } return blendLight(base,layer/strength,strength,mode); }
fn adjusted(v:f32)->vec3f { let f=clamp(v,0.,1.); if(u.blurRadii[1].w<=.5) { return vec3f(f); } let p=f*4095.; let lo=i32(floor(p)); let hi=min(lo+1,4095); return mix(textureLoad(adjustmentLut,vec2i(lo,0),0).rgb,textureLoad(adjustmentLut,vec2i(hi,0),0).rgb,p-f32(lo)); }
fn sourceValue(uv:vec2f)->f32 { return pow(clamp(textureSample(src,samp,uv).r,0.,1.),u.finalContrast); }
fn lensUv(centered:vec2f,coefficient:f32,fit:f32)->vec2f { return .5+centered*((1.+coefficient*dot(centered,centered))/fit)*.5; }
@fragment fn fs(@builtin(position) pos:vec4f)->@location(0) vec4f {
 let uv=pos.xy/u.resolution; let centered=uv*2.-1.; var sampleUv=uv; var redUv=uv; var blueUv=uv;
 let distortionEnabled=u.post[9].y>.5 && u.post[7].x!=0.; let dispersionEnabled=u.post[8].w>.5 && u.post[6].y!=0.;
 if(distortionEnabled || dispersionEnabled) { let distortion=select(0.,u.post[7].x,distortionEnabled); let dispersion=select(0.,u.post[6].y*.001,dispersionEnabled); let redCoefficient=distortion-dispersion*.552535; let greenCoefficient=distortion; let blueCoefficient=distortion+dispersion; let fit=1.+2.*max(0.,max(redCoefficient,max(greenCoefficient,blueCoefficient))); sampleUv=lensUv(centered,greenCoefficient,fit); if(dispersionEnabled) { redUv=lensUv(centered,redCoefficient,fit); blueUv=lensUv(centered,blueCoefficient,fit); } }
 var f=sourceValue(sampleUv); if(u.post[9].z>.5 && u.post[7].y!=0.) { let px=1./u.resolution; let n=sourceValue(sampleUv+vec2f(px.x,0))+sourceValue(sampleUv-vec2f(px.x,0))+sourceValue(sampleUv+vec2f(0,px.y))+sourceValue(sampleUv-vec2f(0,px.y)); f+=(f*4.-n)*u.post[7].y; }
 var rgb=adjusted(f); if(dispersionEnabled) { rgb=vec3f(adjusted(sourceValue(redUv)).r,rgb.g,adjusted(sourceValue(blueUv)).b); }
 if(u.post[0].x>.5) { rgb*=exp2(u.post[0].y); let temp=(u.post[0].z-6500.)/2000.; rgb*=vec3f(1.+temp*.08,1.,1.-temp*.08); rgb+=vec3f(u.post[0].w*.25,u.post[0].w*.5,-u.post[0].w*.25); rgb=(rgb-.5)*(1.+u.post[1].x)+.5; let l=dot(rgb,vec3f(.2126,.7152,.0722)); let range=clamp(max(rgb.r,max(rgb.g,rgb.b))-min(rgb.r,min(rgb.g,rgb.b)),0.,1.); rgb=mix(vec3f(l),rgb,1.+u.post[1].y+u.post[1].z*(1.-range)); rgb+=u.post[1].w*(1.-smoothstep(0.,.5,l))+u.post[2].x*smoothstep(.5,1.,l); }
 if(u.post[2].y>.5 && u.post[2].z!=0. && u.post[2].w!=0.) { rgb=blendLayer(rgb,textureSample(godRays,samp,uv).rgb,u.post[8].x); }
 var bloomRgb=vec3f(0); if((u.post[4].y>.5 && u.post[5].x!=0.) || (u.post[5].z>.5 && u.post[5].w!=0.)) { bloomRgb=textureSample(bloom,samp,uv).rgb; }
 if(u.post[4].y>.5 && u.post[5].x!=0.) { rgb=blendLayer(rgb,bloomRgb*u.post[5].x,u.post[8].y); } if(u.post[5].z>.5 && u.post[5].w!=0.) { rgb=blendLayer(rgb,hueRotate(bloomRgb,u.post[6].x)*u.post[5].w,u.post[8].z); }
 if(u.post[9].x>.5 && u.post[6].z!=0.) { let edge=smoothstep(1.-u.post[6].w,1.,length(centered)*.707); rgb*=1.-edge*u.post[6].z; } if(u.post[9].w>.5 && u.post[7].z!=0.) { let grain=fract(sin(dot(floor(pos.xy/u.post[7].w),vec2f(12.9898,78.233))+u.frameIndex)*43758.5453)-.5; rgb+=grain*u.post[7].z; }
 return vec4f(rgb,1.);
}`;
export const BLOOM_EXTRACT_SHADER_SOURCE =
    COMMON_SHADER_SOURCE +
    /* wgsl */ `
@group(0) @binding(1) var src:texture_2d<f32>; @group(0) @binding(2) var samp:sampler; @group(0) @binding(3) var adjustmentLut:texture_2d<f32>; @group(0) @binding(4) var godRays:texture_2d<f32>;
fn adjusted(v:f32)->vec3f { let f=clamp(v,0.,1.); if(u.blurRadii[1].w<=.5) { return vec3f(f); } let p=f*4095.; let lo=i32(floor(p)); let hi=min(lo+1,4095); return mix(textureLoad(adjustmentLut,vec2i(lo,0),0).rgb,textureLoad(adjustmentLut,vec2i(hi,0),0).rgb,p-f32(lo)); }
fn overlayChannel(base:f32,blend:f32)->f32 { return select(2.*base*blend,1.-2.*(1.-base)*(1.-blend),base>.5); }
fn softLightChannel(base:f32,blend:f32)->f32 { return select(base-(1.-2.*blend)*base*(1.-base),base+(2.*blend-1.)*(sqrt(base)-base),blend>.5); }
fn extendedLightChannel(a:f32,b:f32,mode:f32)->f32 { if(mode<4.5) { return a*b; } if(mode<5.5) { return abs(a-b); } if(mode<6.5) { return 1.-abs(1.-a-b); } if(mode<7.5) { return a+b-2.*a*b; } if(mode<8.5) { return min(a,b); } if(mode<9.5) { return max(a,b); } if(mode<10.5) { return select(1.,min(1.,a/max(1.-b,.00001)),b<1.); } if(mode<11.5) { return select(0.,1.-min(1.,(1.-a)/max(b,.00001)),b>0.); } if(mode<12.5) { return overlayChannel(b,a); } if(mode<13.5) { return a-b; } return select(1.,a/max(b,.00001),b>0.); }
fn blendLight(base:vec3f,color:vec3f,amount:f32,mode:f32)->vec3f { if(amount==0.) { return base; } if(mode<.5) { return base+color*amount; } let bounded=clamp(base,vec3f(0),vec3f(1)); let excess=max(base-vec3f(1),vec3f(0)); if(mode<1.5) { return 1.-(1.-bounded)*(1.-clamp(color*amount,vec3f(0),vec3f(1)))+excess; } let strength=clamp(amount,0.,1.); var blended:vec3f; if(mode<2.5) { blended=vec3f(overlayChannel(bounded.r,color.r),overlayChannel(bounded.g,color.g),overlayChannel(bounded.b,color.b)); } else if(mode<3.5) { blended=vec3f(softLightChannel(bounded.r,color.r),softLightChannel(bounded.g,color.g),softLightChannel(bounded.b,color.b)); } else { let c=clamp(color,vec3f(0),vec3f(1)); blended=vec3f(extendedLightChannel(bounded.r,c.r,mode),extendedLightChannel(bounded.g,c.g,mode),extendedLightChannel(bounded.b,c.b,mode)); } return mix(bounded,blended,strength)+excess; }
fn blendLayer(base:vec3f,layer:vec3f,mode:f32)->vec3f { if(mode<.5) { return base+layer; } let strength=select(max(abs(layer.r),max(abs(layer.g),abs(layer.b))),max(layer.r,max(layer.g,layer.b)),mode<3.5); if(strength<=0.) { return base; } return blendLight(base,layer/strength,strength,mode); }
@fragment fn fs(@builtin(position) pos:vec4f)->@location(0) vec4f {
 let uv=pos.xy/u.resolution; let v=pow(clamp(textureSample(src,samp,uv).r,0.,1.),u.finalContrast); var rgb=adjusted(v);
 if(u.post[0].x>.5) { rgb*=exp2(u.post[0].y); let temp=(u.post[0].z-6500.)/2000.; rgb*=vec3f(1.+temp*.08,1.,1.-temp*.08); rgb+=vec3f(u.post[0].w*.25,u.post[0].w*.5,-u.post[0].w*.25); rgb=(rgb-.5)*(1.+u.post[1].x)+.5; let gradeLuma=dot(rgb,vec3f(.2126,.7152,.0722)); let range=clamp(max(rgb.r,max(rgb.g,rgb.b))-min(rgb.r,min(rgb.g,rgb.b)),0.,1.); rgb=mix(vec3f(gradeLuma),rgb,1.+u.post[1].y+u.post[1].z*(1.-range)); rgb+=u.post[1].w*(1.-smoothstep(0.,.5,gradeLuma))+u.post[2].x*smoothstep(.5,1.,gradeLuma); }
 if(u.post[2].y>.5 && u.post[2].z!=0. && u.post[2].w!=0.) { rgb=blendLayer(rgb,textureSample(godRays,samp,uv).rgb,u.post[8].x); }
 let luminance=dot(max(rgb,vec3f(0)),vec3f(.2126,.7152,.0722)); let t=u.post[4].z; let k=max(u.post[4].w,.00001); let soft=clamp((luminance-t+k)/(2.*k),0.,1.); let contribution=max(luminance-t,0.)+soft*soft*k; let weight=select(0.,contribution/max(luminance,.00001),luminance>0.); return vec4f(rgb*weight,1);
}`;
export const BLOOM_BLUR_SHADER_SOURCE =
    COMMON_SHADER_SOURCE +
    /* wgsl */ `
@group(0) @binding(1) var src:texture_2d<f32>; @group(0) @binding(2) var samp:sampler;
@fragment fn fs(@builtin(position) pos:vec4f)->@location(0) vec4f { let uv=pos.xy/u.resolution; let o=(1.+u.post[5].y*3.)/vec2f(textureDimensions(src)); var rgb=textureSample(src,samp,uv+o).rgb+textureSample(src,samp,uv-o).rgb+textureSample(src,samp,uv+vec2f(-o.x,o.y)).rgb+textureSample(src,samp,uv+vec2f(o.x,-o.y)).rgb; return vec4f(rgb*.25,1); }`;

/** Scalar-to-RGBA materialization before the Colour pipeline. */
export const MATERIALIZE_SHADER_SOURCE =
    COMMON_SHADER_SOURCE +
    /* wgsl */ `
@group(0) @binding(1) var src:texture_2d<f32>; @group(0) @binding(2) var samp:sampler;
@fragment fn fs(@builtin(position) pos:vec4f)->@location(0) vec4f { let v=pow(clamp(textureSample(src,samp,pos.xy/u.resolution).r,0.,1.),u.finalContrast); return vec4f(vec3f(v),1.); }`;

/** A single literal post item; u.blurRadii[1].z selects its kind. */
export const POST_EFFECT_SHADER_SOURCE =
    COMMON_SHADER_SOURCE +
    /* wgsl */ `
@group(0) @binding(1) var src:texture_2d<f32>; @group(0) @binding(2) var samp:sampler; @group(0) @binding(3) var history:texture_2d<f32>;
fn overlayChannel(base:f32,blend:f32)->f32{return select(2.*base*blend,1.-2.*(1.-base)*(1.-blend),base>.5);}
fn softLightChannel(base:f32,blend:f32)->f32{return select(base-(1.-2.*blend)*base*(1.-base),base+(2.*blend-1.)*(sqrt(base)-base),blend>.5);}
fn extendedLightChannel(a:f32,b:f32,mode:f32)->f32{if(mode<4.5){return a*b;}if(mode<5.5){return abs(a-b);}if(mode<6.5){return 1.-abs(1.-a-b);}if(mode<7.5){return a+b-2.*a*b;}if(mode<8.5){return min(a,b);}if(mode<9.5){return max(a,b);}if(mode<10.5){return select(1.,min(1.,a/max(1.-b,.00001)),b<1.);}if(mode<11.5){return select(0.,1.-min(1.,(1.-a)/max(b,.00001)),b>0.);}if(mode<12.5){return overlayChannel(b,a);}if(mode<13.5){return a-b;}return select(1.,a/max(b,.00001),b>0.);}
fn blendLight(base:vec3f,color:vec3f,amount:f32,mode:f32)->vec3f{if(amount==0.){return base;}if(mode<.5){return base+color*amount;}let bounded=clamp(base,vec3f(0),vec3f(1));let excess=max(base-vec3f(1),vec3f(0));if(mode<1.5){return 1.-(1.-bounded)*(1.-clamp(color*amount,vec3f(0),vec3f(1)))+excess;}let strength=clamp(amount,0.,1.);var blended:vec3f;if(mode<2.5){blended=vec3f(overlayChannel(bounded.r,color.r),overlayChannel(bounded.g,color.g),overlayChannel(bounded.b,color.b));}else if(mode<3.5){blended=vec3f(softLightChannel(bounded.r,color.r),softLightChannel(bounded.g,color.g),softLightChannel(bounded.b,color.b));}else{let c=clamp(color,vec3f(0),vec3f(1));blended=vec3f(extendedLightChannel(bounded.r,c.r,mode),extendedLightChannel(bounded.g,c.g,mode),extendedLightChannel(bounded.b,c.b,mode));}return mix(bounded,blended,strength)+excess;}
fn blend(base:vec3f,layer:vec3f,mode:f32)->vec3f{if(mode<.5){return base+layer;}let strength=select(max(abs(layer.r),max(abs(layer.g),abs(layer.b))),max(layer.r,max(layer.g,layer.b)),mode<3.5);if(strength<=0.){return base;}return blendLight(base,layer/strength,strength,mode);}
fn hue(c:vec3f,h:f32)->vec3f { let a=h*6.2831853; let y=dot(c,vec3f(.299,.587,.114)); let i=dot(c,vec3f(.596,-.274,-.322)); let q=dot(c,vec3f(.211,-.523,.312)); let z=vec2f(i*cos(a)-q*sin(a),i*sin(a)+q*cos(a)); return vec3f(y+.956*z.x+.621*z.y,y-.272*z.x-.647*z.y,y-1.106*z.x+1.703*z.y); }
fn p(i:u32)->f32{return u.post[i/4u][i%4u];} fn safe(q:vec2f)->vec2f{return clamp(q,vec2f(0),vec2f(1));} fn luma(c:vec3f)->f32{return dot(max(c,vec3f(0)),vec3f(.2126,.7152,.0722));} fn hash(q:vec2f)->f32{return fract(sin(dot(q,vec2f(127.1,311.7))+u.seed)*43758.5453);}
fn avalanche(v:u32)->u32{var x=v;x^=x>>16u;x*=0x7feb352du;x^=x>>15u;x*=0x846ca68bu;x^=x>>16u;return x;}
fn frameHash(q:vec2f,frame:u32)->f32{let cell=vec2u(max(q,vec2f(0)));let seedBits=bitcast<u32>(u.seed);let bits=avalanche((cell.x*0x9e3779b9u)^(cell.y*0x85ebca6bu)^(frame*0xc2b2ae35u)^seedBits);return f32(bits)*2.3283064365386963e-10;}
@fragment fn fs(@builtin(position) pos:vec4f)->@location(0) vec4f { let uv=pos.xy/u.resolution; let px=1./u.resolution; let kind=i32(u.blurRadii[1].z); var rgb=textureSample(src,samp,uv).rgb;
if(kind==0){let center=vec2f(.5)+u.post[3].zw*.5;let contraction=max(1.-u.post[2].z/16384.,0.);var rays=vec3f(0);let count=u32(round(u.post[4].x));for(var i=0u;i<128u;i++){if(i<count){let q=center+(uv-center)*pow(contraction,f32(i)/max(f32(count-1u),1.)*64.);let c=textureSampleLevel(src,samp,q,0.).rgb;let l=dot(max(c,vec3f(0)),vec3f(.2126,.7152,.0722));let rayOffset=(q-center)*vec2f(u.resolution.x/u.resolution.y,1.);let attenuation=1./(1.+p(106)*dot(rayOffset,rayOffset));rays+=c*smoothstep(u.post[3].x-u.post[3].y,u.post[3].x+u.post[3].y,l)*attenuation;}}rgb=blend(rgb,rays/max(f32(count),1.)*u.post[2].w,u.post[8].x);}
else if(kind==1 || kind==2){var b=vec3f(0);let radius=(1.+u.post[5].y*3.)*px;for(var x=-2;x<=2;x++){for(var y=-2;y<=2;y++){let c=textureSample(src,samp,uv+vec2f(f32(x),f32(y))*radius).rgb;let l=dot(max(c,vec3f(0)),vec3f(.2126,.7152,.0722));b+=c*smoothstep(u.post[4].z-u.post[4].w,u.post[4].z+u.post[4].w,l);}}b/=25.;if(kind==1){rgb=blend(rgb,b*u.post[5].x,u.post[8].y);}else{rgb=blend(rgb,hue(b,u.post[6].x)*u.post[5].w,u.post[8].z);}}
else if(kind==3){let d=p(25)*.001;rgb=vec3f(textureSample(src,samp,safe(uv+vec2f(d,0))).r,rgb.g,textureSample(src,samp,safe(uv-vec2f(d,0))).b);}else if(kind==4){let e=smoothstep(1.-p(27),1.,length(uv*2.-1.)*.707);rgb*=1.-e*p(26);}else if(kind==5){let c=uv*2.-1.;let k=p(28);let fit=1.+2.*max(k,0.);rgb=textureSample(src,samp,safe(.5+c*((1.+k*dot(c,c))/fit)*.5)).rgb;}else if(kind==6){let n=textureSample(src,samp,safe(uv+vec2f(px.x,0))).rgb+textureSample(src,samp,safe(uv-vec2f(px.x,0))).rgb+textureSample(src,samp,safe(uv+vec2f(0,px.y))).rgb+textureSample(src,samp,safe(uv-vec2f(0,px.y))).rgb;rgb+=(rgb*4.-n)*p(29);}else if(kind==7){let g=frameHash(floor(pos.xy/p(31)),u32(u.frameIndex))-.5;rgb+=g*p(30);}
else if(kind==8){var b=vec3f(0);for(var i=1;i<=8;i++){let o=vec2f(f32(i)*p(42),0)*px;let c=textureSample(src,samp,safe(uv+o)).rgb+textureSample(src,samp,safe(uv-o)).rgb;b+=max(c-vec3f(p(43)),vec3f(0));}rgb+=b/16.*vec3f(1,.25,.05)*p(41);}
else if(kind==9||kind==10){var b=vec3f(0);for(var i=0;i<32;i++){let blades=max(p(52),2.);let a=select(p(47),6.2831853*f32(i%i32(blades))/blades,kind==10);let o=vec2f(cos(a),sin(a))*f32(i/4)*select(p(46),p(51),kind==10)*px;let c=textureSample(src,samp,safe(uv+o)).rgb;b+=max(c-vec3f(select(p(48),p(53),kind==10)),vec3f(0));}rgb+=b/32.*select(p(45),p(50),kind==10);}
else if(kind==11){let dirt=smoothstep(.72,.98,hash(floor(uv*p(56)*23.)))+smoothstep(.8,1.,sin((uv.x+uv.y)*p(56)*40.)*.5+.5);rgb+=rgb*smoothstep(p(57),p(57)+.2,luma(rgb))*dirt*p(55);}
else if(kind==12){var g=vec3f(0);for(var i=1;i<=8;i++){if(f32(i)<=p(60)){let q=.5-(uv-.5)*(f32(i)*p(61));g+=textureSample(src,samp,safe(q)).rgb;}}rgb+=g/max(p(60),1.)*p(59);}
else if(kind==13){var b=vec3f(0);let n=u32(p(65));for(var i=0u;i<32u;i++){if(i<n){let r=sqrt((f32(i)+.5)/f32(n))*p(64);let a=f32(i)*2.399963;let q=uv+vec2f(cos(a),sin(a))*r*px;let c=textureSample(src,samp,safe(q)).rgb;b+=c*smoothstep(p(67),p(67)+.2,luma(c));}}rgb+=b/max(f32(n),1.)*p(63);}
else if(kind==14){let q=uv+vec2f(sin(u.time*p(70)*17.),cos(u.time*p(70)*13.))*p(69)*px;rgb=textureSample(src,samp,safe(q)).rgb;}
else if(kind==15){let h=hash(floor(pos.xy/vec2f(5,19))+vec2f(u.frameIndex));let dust=step(1.-p(73)*.02,h);let scratch=step(1.-p(74)*.01,hash(vec2f(floor(pos.x),floor(u.time*12.))));rgb=(rgb+vec3f(dust-scratch))*mix(1.,.8+hash(vec2f(u.frameIndex,3.))*.4,p(75))*p(72)+rgb*(1.-p(72));}
else if(kind>=16&&kind<=18){var b=vec3f(0);let n=u32(select(select(p(78),p(81),kind==17),p(85),kind==18));for(var i=0u;i<32u;i++){if(i<n){let t=(f32(i)/max(f32(n-1u),1.)-.5);var q=uv;if(kind==16){q=.5+(uv-.5)*(1.+t*p(77));}else if(kind==17){let a=t*p(80);let c=cos(a);let s=sin(a);let d=uv-.5;q=.5+vec2f(c*d.x-s*d.y,s*d.x+c*d.y);}else{q+=vec2f(cos(p(84)),sin(p(84)))*t*p(83)*px;}b+=textureSample(src,samp,safe(q)).rgb;}}rgb=b/max(f32(n),1.);}
else if(kind==19){rgb=textureSample(src,samp,safe(uv+vec2f(sin(uv.y*30.+u.time*p(88))*p(87),0))).rgb;}
else if(kind==20){let w=vec2f(sin(uv.y*p(91)+u.time*p(92)),cos(uv.x*p(91)*.7+u.time*p(92)))*p(90);rgb=textureSample(src,samp,safe(uv+w)).rgb;}
else if(kind==21){let d=vec2f(cos(p(95)),sin(p(95)))*p(94)*px;rgb=vec3f(textureSample(src,samp,safe(uv+d)).r,rgb.g,textureSample(src,samp,safe(uv-d)).b);}
else if(kind==22){let d=uv-.5;let seg=6.2831853/p(98);let a=abs(fract((atan2(d.y,d.x)+seg*.5)/seg)*seg-seg*.5);let q=.5+length(d)*vec2f(cos(a),sin(a));rgb=mix(rgb,textureSample(src,samp,safe(q)).rgb,p(97));}
else if(kind==23){let bs=p(101);let block=floor(pos.xy/bs);let shift=(hash(block+vec2f(u.frameIndex))-.5)*p(100)*.2;let q=safe(uv+vec2f(shift,0));let current=textureSample(src,samp,q).rgb;let previous=textureSample(history,samp,q).rgb;rgb=mix(current,previous,clamp(p(100),0.,1.));}
else{let line=floor(pos.y);let tear=(hash(vec2f(line,floor(u.time*p(105))))-.5)*step(.92,hash(vec2f(line,7.)));let shift=(sin(uv.y*p(104)+u.time*p(105))+tear)*p(103);rgb=textureSample(src,samp,safe(uv+vec2f(shift,0))).rgb;}return vec4f(rgb,1.);}`;
export const PRESENT_SHADER_SOURCE =
    COMMON_SHADER_SOURCE +
    /* wgsl */ `@group(0) @binding(1) var src:texture_2d<f32>;@group(0) @binding(2) var samp:sampler;@fragment fn fs(@builtin(position) pos:vec4f)->@location(0) vec4f{return vec4f(textureSample(src,samp,pos.xy/u.resolution).rgb,1.);}`;
export const COLOUR_EFFECT_SHADER_SOURCE =
    COMMON_SHADER_SOURCE +
    /* wgsl */ `
@group(0) @binding(1)var src:texture_2d<f32>;@group(0) @binding(2)var samp:sampler;
fn p(i:u32)->f32{return u.post[i/4u][i%4u];} fn lum(c:vec3f)->f32{return dot(c,vec3f(.2126,.7152,.0722));} fn aces(x:vec3f)->vec3f{return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),vec3f(0),vec3f(1));} fn agx(x:vec3f)->vec3f{let y=clamp((log2(max(x,vec3f(1e-6)))+10.)/16.,vec3f(0),vec3f(1));return y*y*(3.-2.*y);}
@fragment fn fs(@builtin(position)pos:vec4f)->@location(0)vec4f{let uv=pos.xy/u.resolution;var c=textureSample(src,samp,uv).rgb;let k=i32(u.blurRadii[1].z);
if(k==0){c=pow(max(c+vec3f(p(0),p(1),p(2)),vec3f(0)),1./max(vec3f(p(3),p(4),p(5)),vec3f(.001)))*vec3f(p(6),p(7),p(8));}
else if(k==1){let l=lum(c);let sw=1.-smoothstep(.2,.55,l);let hw=smoothstep(.45,.8,l);let mw=max(0.,1.-sw-hw);c+=vec3f(p(0),p(1),p(2))*sw+vec3f(p(3),p(4),p(5))*mw+vec3f(p(6),p(7),p(8))*hw;c*=exp2(p(9));}
else if(k==2){c=mat3x3f(p(0),p(3),p(6),p(1),p(4),p(7),p(2),p(5),p(8))*c+vec3f(p(9),p(10),p(11));}
else if(k==3){let l=lum(c);c+=vec3f(p(0),p(1),p(2))*(1.-smoothstep(.2,.5,l))+vec3f(p(3),p(4),p(5))*(1.-abs(l-.5)*2.)+vec3f(p(6),p(7),p(8))*smoothstep(.5,.8,l);}
else if(k==4){let mx=max(c.r,max(c.g,c.b));let mn=min(c.r,min(c.g,c.b));let sat=mx-mn;var range=8u;if(mx==c.r&&sat>.05){range=0u;}else if(mx==c.g&&sat>.05){range=2u;}else if(mx==c.b&&sat>.05){range=4u;}else if(lum(c)>.75){range=6u;}else if(lum(c)>.25){range=7u;}let q=range*4u;c=c*(1.-vec3f(p(q),p(q+1u),p(q+2u)))-vec3f(p(q+3u));}
else if(k==6){let n=max(p(0),2.);c=round(clamp(c,vec3f(0),vec3f(1))*(n-1.))/(n-1.);}else if(k==7){c=mix(c,1.-c,vec3f(c>=vec3f(p(1)))*p(0));}
else if(k==8){let levels=max(p(0),2.);var n:f32;if(p(2)<.5){let b=array<f32,16>(0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);n=b[(u32(pos.x)&3u)+(u32(pos.y)&3u)*4u]/16.-.5;}else if(p(2)<1.5){n=fract(sin(dot(floor(pos.xy),vec2f(12.9898,78.233)))*43758.5453)-.5;}else{n=fract(sin(dot(floor(pos.xy)+vec2f(f32(u32(pos.y)&1u)*.37,0),vec2f(91.7,17.3)))*41371.1)-.5;}c=round(clamp(c+n*p(1)/levels,vec3f(0),vec3f(1))*(levels-1.))/(levels-1.);}
else if(k==9){if(p(3)<.5){}else if(p(3)<1.5){c=c/(1.+c);}else if(p(3)<2.5){c=aces(c);}else if(p(3)<3.5){c=agx(c);}else{c=pow(max(c*p(0),vec3f(0)),vec3f(1./max(p(1),.01)));c=c/(vec3f(p(2))+c);}}
else if(k==10){c*=exp2(p(0));let t=(p(1)-6500.)/2000.;c*=vec3f(1.+t*.08,1.,1.-t*.08);c+=vec3f(p(2)*.25,p(2)*.5,-p(2)*.25);c=(c-.5)*(1.+p(3))+.5;let l=lum(c);let range=clamp(max(c.r,max(c.g,c.b))-min(c.r,min(c.g,c.b)),0.,1.);c=mix(vec3f(l),c,1.+p(4)+p(5)*(1.-range));c+=p(6)*(1.-smoothstep(0.,.5,l))+p(7)*smoothstep(.5,1.,l);}return vec4f(c,1);}`;
export const COLOUR_KIND_INDEX = Object.fromEntries(RGB_COLOUR_KINDS.map((x, i) => [x, i])) as Record<
    RgbColourEffect['type'],
    number
>;
export const LUT_SHADER_SOURCE =
    COMMON_SHADER_SOURCE +
    /* wgsl */ `
@group(0) @binding(1)var src:texture_2d<f32>;@group(0) @binding(2)var samp:sampler;@group(0) @binding(3)var cube:texture_3d<f32>;
fn p(i:u32)->f32{return u.post[i/4u][i%4u];}
@fragment fn fs(@builtin(position)pos:vec4f)->@location(0)vec4f{let uv=pos.xy/u.resolution;let source=textureSample(src,samp,uv).rgb;let domainMin=vec3f(p(0),p(1),p(2));let domainMax=vec3f(p(3),p(4),p(5));let coordinate=clamp((source-domainMin)/(domainMax-domainMin),vec3f(0),vec3f(1));let mapped=textureSample(cube,samp,coordinate).rgb;return vec4f(mix(source,mapped,clamp(p(6),0.,1.)),1);}`;
export function cubeRgba16Data(data: Float32Array) {
    const result = new Uint16Array((data.length / 3) * 4),
        bits = new Uint32Array(1),
        float = new Float32Array(bits.buffer);
    const half = (value: number) => {
        float[0] = Number.isFinite(value) ? value : 0;
        const x = bits[0],
            sign = (x >>> 16) & 0x8000,
            exponent = ((x >>> 23) & 255) - 112;
        return exponent <= 0 ? sign : exponent >= 31 ? sign | 0x7c00 : sign | (exponent << 10) | ((x >>> 13) & 0x3ff);
    };
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
        result[j] = half(data[i]);
        result[j + 1] = half(data[i + 1]);
        result[j + 2] = half(data[i + 2]);
        result[j + 3] = 0x3c00;
    }
    return result;
}
export const POST_KIND_INDEX: Record<PostEffectKind, number> = {
    'god-rays': 0,
    bloom: 1,
    glow: 2,
    'chromatic-aberration': 3,
    vignette: 4,
    'lens-distortion': 5,
    sharpen: 6,
    'film-grain': 7,
    halation: 8,
    'anamorphic-streaks': 9,
    'diffraction-starburst': 10,
    'lens-dirt': 11,
    'lens-ghosts': 12,
    'bokeh-bloom': 13,
    'gate-weave': 14,
    'film-damage': 15,
    'radial-blur': 16,
    'spin-blur': 17,
    'directional-blur': 18,
    'rolling-shutter': 19,
    'heat-haze': 20,
    'prism-dispersion': 21,
    kaleidoscope: 22,
    datamosh: 23,
    'scanline-displacement': 24,
};

export class AtmosphereRenderer {
    private device?: GPUDevice;
    private context: GPUCanvasContext | null = null;
    private pipelines: GPURenderPipeline[] = [];
    private textures: GPUTexture[] = [];
    private textureViews: GPUTextureView[] = [];
    private sampler?: GPUSampler;
    private adjustmentTexture?: GPUTexture;
    private adjustmentView?: GPUTextureView;
    private adjustmentLutActive = false;
    private adjustmentsKey = '';
    private lutTextures = new Map<string, { texture: GPUTexture; view: GPUTextureView; asset: CubeLut }>();
    private historyTexture?: GPUTexture;
    private historyView?: GPUTextureView;
    private historyValid = false;
    private datamoshWasActive = false;
    private buffers: GPUBuffer[] = [];
    private bindGroups = new Map<string, GPUBindGroup>();
    private observer: ResizeObserver;
    private rafId = 0;
    private simTime = 0;
    private frameIndex = 0;
    private lastTime = performance.now();
    private statsStartedAt = this.lastTime;
    private statsFrames = 0;
    private frameTelemetry = new FrameTelemetry();
    private destroyed = false;
    private invalid = true;
    readonly gpuTimingSupported = false;
    private querySet?: GPUQuerySet;
    private queryResolveBuffer?: GPUBuffer;
    private queryReadbackBuffer?: GPUBuffer;
    private queryReadbackBusy = false;
    private renderedFrames = 0;
    private gpuStatsCallback?: (stats: GpuTimingStats | null) => void;
    paused = false;
    onStats?: (fps: number, width: number, height: number, rolling?: FrameRollingSummary) => void;
    get onGpuStats() {
        return this.gpuStatsCallback;
    }
    set onGpuStats(callback: ((stats: GpuTimingStats | null) => void) | undefined) {
        this.gpuStatsCallback = callback;
        if (callback && !this.gpuTimingSupported) callback(null);
    }
    onLost?: (message: string) => void;

    private constructor(
        private canvas: HTMLCanvasElement,
        public options: RenderOptions,
    ) {
        this.observer = new ResizeObserver(() => {
            this.resize();
            this.invalidate();
        });
    }

    static async create(canvas: HTMLCanvasElement, options: RenderOptions) {
        if (!navigator.gpu) throw new Error('WebGPU is not available in this browser.');
        const self = new AtmosphereRenderer(canvas, options);
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) throw new Error('No compatible WebGPU adapter was found.');
        const gpuTimingSupported = adapter.features.has('timestamp-query');
        self.device = await adapter.requestDevice(
            gpuTimingSupported ? { requiredFeatures: ['timestamp-query'] } : undefined,
        );
        Object.defineProperty(self, 'gpuTimingSupported', { value: gpuTimingSupported });
        self.context = canvas.getContext('webgpu');
        if (!self.context) throw new Error('Could not create a WebGPU canvas context.');
        const format = navigator.gpu.getPreferredCanvasFormat();
        self.context.configure({ device: self.device, format, alphaMode: 'opaque' });
        const make = async (code: string, target: GPUTextureFormat) => {
            const module = self.device!.createShaderModule({ code });
            const info = await module.getCompilationInfo();
            const errors = info.messages.filter((message) => message.type === 'error');
            if (errors.length) throw new Error(errors.map((message) => message.message).join('\n'));
            return self.device!.createRenderPipeline({
                layout: 'auto',
                vertex: { module, entryPoint: 'vs' },
                fragment: { module, entryPoint: 'fs', targets: [{ format: target }] },
            });
        };
        self.pipelines = await Promise.all([
            make(BASE_SHADER_SOURCE, 'r16float'),
            make(BLUR_SHADER_SOURCE, 'rgba16float'),
            make(OCTAVE_SHADER_SOURCE, 'rgba16float'),
            make(DISPLAY_SHADER_SOURCE, format),
            make(BLOOM_EXTRACT_SHADER_SOURCE, BLOOM_TEXTURE_FORMAT),
            make(BLOOM_BLUR_SHADER_SOURCE, BLOOM_TEXTURE_FORMAT),
            make(GOD_RAYS_SHADER_SOURCE, GOD_RAYS_TEXTURE_FORMAT),
            make(MATERIALIZE_SHADER_SOURCE, 'rgba16float'),
            make(POST_EFFECT_SHADER_SOURCE, 'rgba16float'),
            make(PRESENT_SHADER_SOURCE, format),
            make(COLOUR_EFFECT_SHADER_SOURCE, 'rgba16float'),
            make(LUT_SHADER_SOURCE, 'rgba16float'),
        ]);
        self.buffers = Array.from({ length: MAX_RENDER_PASSES }, () =>
            self.device!.createBuffer({
                size: UNIFORM_FLOATS * 4,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            }),
        );
        self.sampler = self.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
        self.adjustmentTexture = self.device.createTexture({
            dimension: '3d',
            size: [ADJUSTMENT_LUT_SIZE, ADJUSTMENT_LUT_SIZE, ADJUSTMENT_LUT_SIZE],
            format: 'rgba16float',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        self.adjustmentView = self.adjustmentTexture.createView({ dimension: '3d' });
        self.updateAdjustmentLut();
        self.updateCubeLuts();
        if (gpuTimingSupported) {
            self.querySet = self.device.createQuerySet({ type: 'timestamp', count: GPU_QUERY_COUNT });
            const size = GPU_QUERY_COUNT * BigUint64Array.BYTES_PER_ELEMENT;
            self.queryResolveBuffer = self.device.createBuffer({
                size,
                usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
            });
            self.queryReadbackBuffer = self.device.createBuffer({
                size,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
        }
        self.device.lost.then((info) => {
            if (!self.destroyed) self.onLost?.(`GPU device lost: ${info.message || info.reason}`);
        });
        self.observer.observe(canvas);
        self.resize();
        self.schedule();
        return self;
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const size = renderSize(rect.width, rect.height, devicePixelRatio, this.options.dprCap);
        if (this.canvas.width !== size.width || this.canvas.height !== size.height) {
            this.canvas.width = size.width;
            this.canvas.height = size.height;
            this.recreateTargets();
        }
    }
    private recreateTargets() {
        if (!this.device) return;
        this.textures.forEach((texture) => texture.destroy());
        this.historyTexture?.destroy();
        this.textureViews = [];
        this.bindGroups.clear();
        const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
        // Scalar field ping-pong, followed by non-aliasing RGBA16F colour/post ping-pong.
        const size = scaledSize(this.canvas.width, this.canvas.height, this.options.renderScale);
        this.textures = [
            ...Array.from({ length: 2 }, () =>
                this.device!.createTexture({ size: [size.width, size.height], format: 'r16float', usage }),
            ),
            ...Array.from({ length: 2 }, () =>
                this.device!.createTexture({
                    size: [size.width, size.height],
                    format: 'rgba16float',
                    usage: usage | GPUTextureUsage.COPY_SRC,
                }),
            ),
        ];
        this.textureViews = this.textures.map((texture) => texture.createView());
        this.historyTexture = this.device.createTexture({
            size: [size.width, size.height],
            format: 'rgba16float',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        this.historyView = this.historyTexture.createView();
        this.historyValid = false;
    }
    setOptions(options: RenderOptions) {
        const changed = this.options.renderScale !== options.renderScale;
        const resetHistory =
            this.options.seed !== options.seed || (datamoshIsActive(options.parameters) && !this.datamoshWasActive);
        this.options = options;
        this.datamoshWasActive = datamoshIsActive(options.parameters);
        this.updateAdjustmentLut();
        this.updateCubeLuts();
        if (changed) this.recreateTargets();
        else if (resetHistory) {
            this.historyValid = false;
            this.bindGroups.clear();
        }
        this.invalidate();
    }
    private updateAdjustmentLut() {
        if (!this.device || !this.adjustmentTexture) return;
        const adjustments = leadingAdjustmentRegion(this.options.colour);
        const key = JSON.stringify(adjustments);
        if (key === this.adjustmentsKey) return;
        this.adjustmentsKey = key;
        this.adjustmentLutActive = adjustments.some((adjustment) => !isNeutralAdjustment(adjustment));
        if (!this.adjustmentLutActive) return;
        const lut = composeAdjustmentLut(adjustments);
        // Copy into an ArrayBuffer-backed view (WebGPU deliberately rejects SharedArrayBuffer views).
        const upload = new Uint16Array(new ArrayBuffer(lut.byteLength));
        upload.set(lut);
        this.device.queue.writeTexture(
            { texture: this.adjustmentTexture },
            upload,
            { bytesPerRow: ADJUSTMENT_LUT_SIZE * 4 * 2, rowsPerImage: ADJUSTMENT_LUT_SIZE },
            [ADJUSTMENT_LUT_SIZE, ADJUSTMENT_LUT_SIZE, ADJUSTMENT_LUT_SIZE],
        );
    }
    private updateCubeLuts() {
        if (!this.device) return;
        const assets = this.options.lutAssets ?? {};
        for (const [id, r] of this.lutTextures)
            if (assets[id] !== r.asset) {
                r.texture.destroy();
                this.lutTextures.delete(id);
            }
        for (const [id, asset] of Object.entries(assets)) {
            if (this.lutTextures.has(id)) continue;
            const texture = this.device.createTexture({
                dimension: '3d',
                size: [asset.size, asset.size, asset.size],
                format: 'rgba16float',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            });
            this.device.queue.writeTexture(
                { texture },
                cubeRgba16Data(asset.data),
                { bytesPerRow: asset.size * 8, rowsPerImage: asset.size },
                [asset.size, asset.size, asset.size],
            );
            this.lutTextures.set(id, { texture, view: texture.createView({ dimension: '3d' }), asset });
        }
        this.bindGroups.clear();
    }
    setPaused(value: boolean) {
        this.paused = value;
        this.lastTime = performance.now();
        this.statsStartedAt = this.lastTime;
        this.statsFrames = 0;
        this.frameTelemetry.reset();
        this.onStats?.(0, this.canvas.width, this.canvas.height, this.frameTelemetry.summary(this.lastTime));
        this.invalidate();
    }
    invalidate() {
        this.invalid = true;
        this.schedule();
    }
    private schedule() {
        if (!this.destroyed && !this.rafId) this.rafId = requestAnimationFrame(this.tick);
    }
    private tick = (now: number) => {
        this.rafId = 0;
        if (this.destroyed) return;
        const animated = !this.paused;
        const dt = Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000));
        this.lastTime = now;
        if (animated) this.simTime = advanceSimulationTime(this.simTime, dt, this.options.parameters.animationSpeed);
        if (this.invalid || animated) {
            this.render();
            this.invalid = false;
            if (animated) {
                this.frameTelemetry.recordRenderedFrame(now);
                this.statsFrames += 1;
            }
            const statsElapsed = now - this.statsStartedAt;
            if (animated && statsElapsed >= 500) {
                const rolling = this.frameTelemetry.summary(now);
                this.onStats?.(rolling.windows[500]?.fps ?? 0, this.canvas.width, this.canvas.height, rolling);
                this.statsStartedAt = now;
                this.statsFrames = 0;
            }
        }
        if (animated) this.schedule();
    };
    private render() {
        const d = this.device,
            c = this.context,
            buffers = this.buffers,
            s = this.sampler;
        if (
            !d ||
            !c ||
            buffers.length < MAX_RENDER_PASSES ||
            !s ||
            this.pipelines.length < 12 ||
            this.textures.length < 4 ||
            this.textureViews.length < 4
        )
            return;
        const enc = d.createCommandEncoder();
        const sampleGpu = Boolean(
            this.querySet && !this.queryReadbackBusy && this.renderedFrames % GPU_TIMING_SAMPLE_INTERVAL === 0,
        );
        const gpuLabels: string[] | undefined = sampleGpu ? [] : undefined;
        const data = packUniform(
            [this.textures[0].width, this.textures[0].height],
            this.simTime,
            this.options.seed,
            this.options.parameters,
            0,
            this.frameIndex,
        );
        let passIndex = 0;
        const draw = (
            target: GPUTextureView,
            pipelineIndex: number,
            sourceTextureIndex?: number,
            usesSampler = false,
            gpuLabel = '',
            lutId?: string,
        ) => {
            const uniformSlot = passIndex++;
            const buffer = buffers[uniformSlot];
            d.queue.writeBuffer(buffer, 0, data);
            const pipeline = this.pipelines[pipelineIndex];
            const cacheKey = `${bindGroupCacheKey(pipelineIndex, sourceTextureIndex, uniformSlot)}:${lutId ?? ''}`;
            let bindGroup = this.bindGroups.get(cacheKey);
            if (!bindGroup) {
                const entries: GPUBindGroupEntry[] = [{ binding: 0, resource: { buffer } }];
                if (sourceTextureIndex !== undefined) {
                    entries.push({ binding: 1, resource: this.textureViews[sourceTextureIndex] });
                    if (usesSampler) entries.push({ binding: 2, resource: s });
                    if (pipelineIndex === 3) {
                        entries.push({ binding: 3, resource: this.adjustmentView! });
                        entries.push({ binding: 4, resource: this.textureViews[3] });
                        entries.push({ binding: 5, resource: this.textureViews[4] });
                    } else if (pipelineIndex === 4) {
                        entries.push({ binding: 3, resource: this.adjustmentView! });
                        entries.push({ binding: 4, resource: this.textureViews[4] });
                    } else if (pipelineIndex === 6) {
                        entries.push({ binding: 3, resource: this.adjustmentView! });
                    } else if (pipelineIndex === 8) {
                        entries.push({ binding: 3, resource: this.historyView! });
                    } else if (pipelineIndex === 11 && lutId) {
                        entries.push({
                            binding: 3,
                            resource:
                                lutId === 'internal-adjustments'
                                    ? this.adjustmentView!
                                    : this.lutTextures.get(lutId)!.view,
                        });
                    }
                }
                bindGroup = d.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries });
                this.bindGroups.set(cacheKey, bindGroup);
            }
            const queryIndex = (gpuLabels?.length ?? 0) * 2;
            const pass = enc.beginRenderPass({
                colorAttachments: [
                    { view: target, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } },
                ],
                ...(sampleGpu
                    ? {
                          timestampWrites: {
                              querySet: this.querySet!,
                              beginningOfPassWriteIndex: queryIndex,
                              endOfPassWriteIndex: queryIndex + 1,
                          },
                      }
                    : {}),
            });
            gpuLabels?.push(gpuLabel);
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.draw(3);
            pass.end();
        };
        draw(this.textureViews[0], 0, undefined, false, 'base');
        data[0] = this.textures[2].width;
        data[1] = this.textures[2].height;
        draw(this.textureViews[2], 7, 0, true, 'field-materialize');
        let rgbaCurrent = 2;
        data.set(
            POST_PARAMETER_SCHEMA.map(({ key }) => this.options.parameters[key]),
            60,
        );
        const postStages = rendererStagePlan(this.options.post, this.options.parameters);
        if (this.adjustmentLutActive) {
            data.fill(0, 60, UNIFORM_FLOATS);
            data.set([0, 0, 0, 1, 1, 1, 1], 60);
            const destination = rgbaCurrent === 2 ? 3 : 2;
            draw(this.textureViews[destination], 11, rgbaCurrent, true, 'colour:adjustments', 'internal-adjustments');
            rgbaCurrent = destination;
        }
        for (const effect of this.options.colour) {
            if (effect.type === 'curve' || effect.type === 'levels' || effect.type === 'hsl') continue;
            if (!effect.enabled || (isRgbColour(effect) && isNeutralRgb(effect))) continue;
            let values: number[];
            let kind: number;
            if (isRgbColour(effect)) {
                if (effect.type === 'lut') {
                    const lut = effect.assetId && this.lutTextures.get(effect.assetId);
                    if (!lut) continue;
                    data.fill(0, 60, UNIFORM_FLOATS);
                    data.set([...lut.asset.domainMin, ...lut.asset.domainMax, effect.values[0]], 60);
                    const destination = rgbaCurrent === 2 ? 3 : 2;
                    draw(
                        this.textureViews[destination],
                        11,
                        rgbaCurrent,
                        true,
                        `colour:${effect.type}`,
                        effect.assetId,
                    );
                    rgbaCurrent = destination;
                    continue;
                }
                values = effect.values;
                kind = COLOUR_KIND_INDEX[effect.type];
                if (effect.type === 'dither')
                    values = [...values, effect.mode === 'bayer' ? 0 : effect.mode === 'blue-noise' ? 1 : 2];
                if (effect.type === 'tone-mapping')
                    values = [...values, ['none', 'reinhard', 'aces', 'agx', 'custom'].indexOf(effect.mode ?? 'none')];
            } else if (effect.type === 'colour-grade') {
                values = [
                    this.options.parameters.exposure,
                    this.options.parameters.temperature,
                    this.options.parameters.tint,
                    this.options.parameters.contrast,
                    this.options.parameters.saturation,
                    this.options.parameters.vibrance,
                    this.options.parameters.shadows,
                    this.options.parameters.highlights,
                ];
                kind = 10;
            } else continue;
            data.fill(0, 60, UNIFORM_FLOATS);
            data.set(values.slice(0, 40), 60);
            data[58] = kind;
            const destination = rgbaCurrent === 2 ? 3 : 2;
            draw(this.textureViews[destination], 10, rgbaCurrent, true, `colour:${effect.type}`);
            rgbaCurrent = destination;
        }
        data.set(
            POST_PARAMETER_SCHEMA.map(({ key }) => this.options.parameters[key]),
            60,
        );
        for (const effect of postStages) {
            if (effect.kind === 'datamosh' && !this.historyValid) continue;
            const destination = rgbaCurrent === 2 ? 3 : 2;
            data[58] = POST_KIND_INDEX[effect.kind];
            draw(this.textureViews[destination], 8, rgbaCurrent, true, `post:${effect.kind}`);
            rgbaCurrent = destination;
        }
        for (let octave = 0; octave < OCTAVE_COUNT; octave += 1) {
            data[29] = octave;
            if (octaveBlurIsActive(this.options.parameters, octave)) {
                const destination = rgbaCurrent === 2 ? 3 : 2;
                draw(this.textureViews[destination], 1, rgbaCurrent, true, `blur${octave + 1}`);
                rgbaCurrent = destination;
            }
            if (octaveEffectIsActive(this.options.parameters, octave)) {
                const destination = rgbaCurrent === 2 ? 3 : 2;
                draw(this.textureViews[destination], 2, rgbaCurrent, true, `octave${octave + 1}`);
                rgbaCurrent = destination;
            }
        }
        data[0] = this.canvas.width;
        data[1] = this.canvas.height;
        draw(c.getCurrentTexture().createView(), 9, rgbaCurrent, true, 'display');
        if (!this.paused && this.historyTexture) {
            enc.copyTextureToTexture({ texture: this.textures[rgbaCurrent] }, { texture: this.historyTexture }, [
                this.textures[rgbaCurrent].width,
                this.textures[rgbaCurrent].height,
            ]);
            this.historyValid = true;
        }
        if (sampleGpu) {
            const bytes = gpuLabels!.length * 16;
            enc.resolveQuerySet(this.querySet!, 0, gpuLabels!.length * 2, this.queryResolveBuffer!, 0);
            enc.copyBufferToBuffer(this.queryResolveBuffer!, 0, this.queryReadbackBuffer!, 0, bytes);
            this.queryReadbackBusy = true;
        }
        d.queue.submit([enc.finish()]);
        if (sampleGpu) this.readGpuTimestamps(gpuLabels!);
        this.renderedFrames += 1;
        if (!this.paused) this.frameIndex = (this.frameIndex + 1) % 16_777_216;
    }
    private readGpuTimestamps(labels: string[]) {
        const buffer = this.queryReadbackBuffer!;
        buffer
            .mapAsync(GPUMapMode.READ)
            .then(() => {
                if (!this.destroyed) {
                    const values = new BigUint64Array(buffer.getMappedRange()).slice(0, labels.length * 2);
                    this.gpuStatsCallback?.(aggregateGpuTimestamps(values, labels));
                }
            })
            .catch(() => {})
            .finally(() => {
                try {
                    if (buffer.mapState === 'mapped') buffer.unmap();
                } catch {}
                this.queryReadbackBusy = false;
            });
    }
    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.observer.disconnect();
        this.textures.forEach((texture) => texture.destroy());
        this.adjustmentTexture?.destroy();
        this.lutTextures.forEach(({ texture }) => texture.destroy());
        this.historyTexture?.destroy();
        this.textureViews = [];
        this.bindGroups.clear();
        this.buffers.forEach((buffer) => buffer.destroy());
        this.buffers = [];
        try {
            if (this.queryReadbackBuffer?.mapState === 'mapped') this.queryReadbackBuffer.unmap();
        } catch {}
        this.querySet?.destroy();
        this.queryResolveBuffer?.destroy();
        this.queryReadbackBuffer?.destroy();
        try {
            this.context?.unconfigure();
        } catch {}
        this.device?.destroy();
    }
    stop() {
        this.destroy();
    }
}
