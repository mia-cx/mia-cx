import { newCurve, newHslAdjustment, newLevels, sanitizeAdjustments, type Adjustment } from './adjustments';
import type { ParameterKey, ShaderParameters } from './renderer';
import {
    RGB_COLOUR_KINDS,
    RGB_COLOUR_LABELS,
    createRgbColour,
    sanitizeRgbColour,
    type RgbColourEffect,
    type RgbColourKind,
} from './colour-effects';

export type ColourEffect = Adjustment | RgbColourEffect | { id: string; type: 'colour-grade'; enabled: boolean };
export { RGB_COLOUR_KINDS, RGB_COLOUR_LABELS };
export type PostEffectKind =
    | 'god-rays'
    | 'bloom'
    | 'glow'
    | 'chromatic-aberration'
    | 'vignette'
    | 'lens-distortion'
    | 'sharpen'
    | 'film-grain'
    | 'halation'
    | 'anamorphic-streaks'
    | 'diffraction-starburst'
    | 'lens-dirt'
    | 'lens-ghosts'
    | 'bokeh-bloom'
    | 'gate-weave'
    | 'film-damage'
    | 'radial-blur'
    | 'spin-blur'
    | 'directional-blur'
    | 'rolling-shutter'
    | 'heat-haze'
    | 'prism-dispersion'
    | 'kaleidoscope'
    | 'datamosh'
    | 'scanline-displacement';
export interface PostEffect {
    id: string;
    type: PostEffectKind;
    enabled: boolean;
}
export type PipelineItem = ColourEffect | PostEffect;

export const POST_KINDS: readonly PostEffectKind[] = [
    'god-rays',
    'bloom',
    'glow',
    'chromatic-aberration',
    'vignette',
    'lens-distortion',
    'sharpen',
    'film-grain',
    'halation',
    'anamorphic-streaks',
    'diffraction-starburst',
    'lens-dirt',
    'lens-ghosts',
    'bokeh-bloom',
    'gate-weave',
    'film-damage',
    'radial-blur',
    'spin-blur',
    'directional-blur',
    'rolling-shutter',
    'heat-haze',
    'prism-dispersion',
    'kaleidoscope',
    'datamosh',
    'scanline-displacement',
];
export const LIGHTING_KINDS = [
    'god-rays',
    'bloom',
    'glow',
    'halation',
    'anamorphic-streaks',
    'diffraction-starburst',
    'lens-dirt',
    'lens-ghosts',
    'bokeh-bloom',
] as const;
export const isLightingKind = (kind: PostEffectKind) => (LIGHTING_KINDS as readonly PostEffectKind[]).includes(kind);

export const POST_LABELS: Record<PostEffectKind, string> = {
    'god-rays': 'God rays',
    bloom: 'Bloom',
    glow: 'Glow',
    'chromatic-aberration': 'Chromatic aberration',
    vignette: 'Vignette',
    'lens-distortion': 'Lens distortion',
    sharpen: 'Sharpen',
    'film-grain': 'Film grain',
    halation: 'Halation',
    'anamorphic-streaks': 'Anamorphic streaks',
    'diffraction-starburst': 'Diffraction starburst',
    'lens-dirt': 'Lens dirt',
    'lens-ghosts': 'Lens ghosts / flare',
    'bokeh-bloom': 'Bokeh bloom',
    'gate-weave': 'Gate weave',
    'film-damage': 'Film damage',
    'radial-blur': 'Radial blur',
    'spin-blur': 'Spin blur',
    'directional-blur': 'Directional motion blur',
    'rolling-shutter': 'Rolling shutter',
    'heat-haze': 'Heat haze',
    'prism-dispersion': 'Prism dispersion',
    kaleidoscope: 'Kaleidoscope',
    datamosh: 'Datamosh',
    'scanline-displacement': 'Scanline displacement',
};
export const POST_KEYS: Record<PostEffectKind, readonly ParameterKey[]> = {
    'god-rays': [
        'godRaysAmount',
        'godRaysIntensity',
        'godRaysThreshold',
        'godRaysSoftness',
        'godRaysCenterX',
        'godRaysCenterY',
        'godRaysSamples',
        'godRaysFalloff',
        'godRaysBlendMode',
    ],
    bloom: ['bloomThreshold', 'bloomKnee', 'bloomIntensity', 'bloomRadius', 'bloomBlendMode'],
    glow: ['glowIntensity', 'glowHue', 'glowBlendMode'],
    'chromatic-aberration': ['chromaticAberration'],
    vignette: ['vignetteAmount', 'vignetteSoftness'],
    'lens-distortion': ['lensDistortion'],
    sharpen: ['sharpen'],
    'film-grain': ['filmGrainAmount', 'filmGrainSize'],
    halation: ['halationAmount', 'halationRadius', 'halationThreshold'],
    'anamorphic-streaks': ['streakAmount', 'streakLength', 'streakAngle', 'streakThreshold'],
    'diffraction-starburst': ['starburstAmount', 'starburstRadius', 'starburstBlades', 'starburstThreshold'],
    'lens-dirt': ['lensDirtAmount', 'lensDirtScale', 'lensDirtThreshold'],
    'lens-ghosts': ['lensGhostAmount', 'lensGhostCount', 'lensGhostSpacing'],
    'bokeh-bloom': ['bokehAmount', 'bokehRadius', 'bokehSamples', 'bokehBlades', 'bokehThreshold'],
    'gate-weave': ['gateWeaveAmount', 'gateWeaveSpeed'],
    'film-damage': ['filmDamageAmount', 'filmDust', 'filmScratches', 'filmFlicker'],
    'radial-blur': ['radialBlurAmount', 'radialBlurSamples'],
    'spin-blur': ['spinBlurAmount', 'spinBlurSamples'],
    'directional-blur': ['directionalBlurAmount', 'directionalBlurAngle', 'directionalBlurSamples'],
    'rolling-shutter': ['rollingShutterAmount', 'rollingShutterSpeed'],
    'heat-haze': ['heatHazeAmount', 'heatHazeScale', 'heatHazeSpeed'],
    'prism-dispersion': ['prismAmount', 'prismAngle'],
    kaleidoscope: ['kaleidoscopeAmount', 'kaleidoscopeSegments'],
    datamosh: ['datamoshAmount', 'datamoshBlockSize'],
    'scanline-displacement': ['scanlineAmount', 'scanlineFrequency', 'scanlineSpeed'],
};
export const COLOUR_GRADE_KEYS: readonly ParameterKey[] = [
    'exposure',
    'temperature',
    'tint',
    'contrast',
    'saturation',
    'vibrance',
    'shadows',
    'highlights',
];
const enabledKeys: Record<PostEffectKind, ParameterKey> = {
    'god-rays': 'godRaysEnabled',
    bloom: 'bloomEnabled',
    glow: 'glowEnabled',
    'chromatic-aberration': 'chromaticAberrationEnabled',
    vignette: 'vignetteEnabled',
    'lens-distortion': 'lensDistortionEnabled',
    sharpen: 'sharpenEnabled',
    'film-grain': 'filmGrainEnabled',
    halation: 'halationEnabled',
    'anamorphic-streaks': 'streakEnabled',
    'diffraction-starburst': 'starburstEnabled',
    'lens-dirt': 'lensDirtEnabled',
    'lens-ghosts': 'lensGhostEnabled',
    'bokeh-bloom': 'bokehEnabled',
    'gate-weave': 'gateWeaveEnabled',
    'film-damage': 'filmDamageEnabled',
    'radial-blur': 'radialBlurEnabled',
    'spin-blur': 'spinBlurEnabled',
    'directional-blur': 'directionalBlurEnabled',
    'rolling-shutter': 'rollingShutterEnabled',
    'heat-haze': 'heatHazeEnabled',
    'prism-dispersion': 'prismEnabled',
    kaleidoscope: 'kaleidoscopeEnabled',
    datamosh: 'datamoshEnabled',
    'scanline-displacement': 'scanlineEnabled',
};
export const stablePipelineId = (scope: 'colour' | 'post', kind: string, occurrence = 0) =>
    `${scope}:${kind}:${occurrence}`;
export function migrateColour(adjustments: unknown, parameters: ShaderParameters): ColourEffect[] {
    return [
        ...sanitizeAdjustments(adjustments),
        {
            id: stablePipelineId('colour', 'colour-grade'),
            type: 'colour-grade',
            enabled: parameters.colorGradeEnabled >= 0.5,
        },
    ];
}
export function migratePost(parameters: ShaderParameters): PostEffect[] {
    return POST_KINDS.map((type) => ({
        id: stablePipelineId('post', type),
        type,
        enabled: parameters[enabledKeys[type]] >= 0.5,
    }));
}
export function syncPipelineToggles(parameters: ShaderParameters, colour: ColourEffect[], post: PostEffect[]) {
    const result = { ...parameters };
    result.colorGradeEnabled = colour.find((x) => x.type === 'colour-grade')?.enabled ? 1 : 0;
    for (const item of post) result[enabledKeys[item.type]] = item.enabled ? 1 : 0;
    return result;
}
export function moveById<T extends { id: string }>(items: T[], id: string, delta: number): T[] {
    const from = items.findIndex((x) => x.id === id),
        to = from + delta;
    if (from < 0 || to < 0 || to >= items.length) return items;
    const copy = [...items];
    [copy[from], copy[to]] = [copy[to], copy[from]];
    return copy;
}
export const removeById = <T extends { id: string }>(items: T[], id: string) => items.filter((x) => x.id !== id);
export const toggleById = <T extends { id: string; enabled: boolean }>(items: T[], id: string) =>
    items.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x));
export function createColour(type: 'curve' | 'levels' | 'hsl' | RgbColourKind, id?: string): ColourEffect {
    if (RGB_COLOUR_KINDS.includes(type as RgbColourKind))
        return createRgbColour(type as RgbColourKind, id ?? crypto.randomUUID());
    const item = type === 'curve' ? newCurve() : type === 'levels' ? newLevels() : newHslAdjustment();
    return id ? { ...item, id } : item;
}
export function sanitizeColour(items: unknown, fallback: ColourEffect[]): ColourEffect[] {
    if (!Array.isArray(items)) return fallback;
    const scalar = sanitizeAdjustments(items);
    const scalarIds = new Set(scalar.map((x) => x.id));
    const result: ColourEffect[] = [];
    for (const raw of items) {
        const x = raw as { id?: string; type?: string; enabled?: boolean };
        if (x?.type === 'colour-grade' && typeof x.id === 'string')
            result.push({ id: x.id, type: 'colour-grade', enabled: x.enabled !== false });
        else if (scalarIds.has(x?.id ?? '')) result.push(scalar.find((a) => a.id === x.id)!);
        else {
            const rgb = sanitizeRgbColour(raw);
            if (rgb) result.push(rgb);
        }
    }
    return ensureGradeLast(result);
}
export function createPost(type: PostEffectKind, items: PostEffect[]): PostEffect {
    let n = 0;
    while (items.some((x) => x.id === stablePipelineId('post', type, n))) n++;
    return { id: stablePipelineId('post', type, n), type, enabled: true };
}
export function ensureGradeLast(items: ColourEffect[]): ColourEffect[] {
    const grades = items.filter((x) => x.type === 'colour-grade');
    return [
        ...items.filter((x) => x.type !== 'colour-grade'),
        grades[0] ?? { id: stablePipelineId('colour', 'colour-grade'), type: 'colour-grade', enabled: true },
    ];
}

export type ColourSegment =
    | { type: 'scalar'; effects: Adjustment[] }
    | { type: 'rgb'; effect: Exclude<ColourEffect, Adjustment> };

/** Preserve literal stack order, coalescing only adjacent scalar-compatible operations. */
export function colourSegments(items: readonly ColourEffect[]): ColourSegment[] {
    const result: ColourSegment[] = [];
    for (const effect of items) {
        if (!effect.enabled) continue;
        if (effect.type === 'curve' || effect.type === 'levels' || effect.type === 'hsl') {
            const previous = result[result.length - 1];
            if (previous?.type === 'scalar') previous.effects.push(effect);
            else result.push({ type: 'scalar', effects: [effect] });
        } else result.push({ type: 'rgb', effect });
    }
    return result;
}
/** Adjustments are UI-constrained to one contiguous leading Colour region. */
export function leadingAdjustmentRegion(items: readonly ColourEffect[]): Adjustment[] {
    const result: Adjustment[] = [];
    for (const item of items) {
        if (item.type !== 'curve' && item.type !== 'levels' && item.type !== 'hsl') break;
        result.push(item);
    }
    return result;
}

export function postRendererPlan(items: PostEffect[], parameters: ShaderParameters) {
    return items
        .filter((x) => x.enabled && !isNeutralPost(x.type, parameters))
        .map((x) => ({ id: x.id, kind: x.type, label: POST_LABELS[x.type] }));
}
export function rendererStagePlan(items: PostEffect[], parameters: ShaderParameters) {
    const enabled = postRendererPlan(items, parameters);
    return {
        lighting: enabled.filter((x) => isLightingKind(x.kind)),
        post: enabled.filter((x) => !isLightingKind(x.kind)),
    };
}

export function isNeutralPost(kind: PostEffectKind, p: ShaderParameters): boolean {
    switch (kind) {
        case 'god-rays':
            return p.godRaysAmount === 0 || p.godRaysIntensity === 0;
        case 'bloom':
            return p.bloomIntensity === 0;
        case 'glow':
            return p.glowIntensity === 0;
        case 'chromatic-aberration':
            return p.chromaticAberration === 0;
        case 'vignette':
            return p.vignetteAmount === 0;
        case 'lens-distortion':
            return p.lensDistortion === 0;
        case 'sharpen':
            return p.sharpen === 0;
        case 'film-grain':
            return p.filmGrainAmount === 0;
        case 'halation':
            return p.halationAmount === 0;
        case 'anamorphic-streaks':
            return p.streakAmount === 0;
        case 'diffraction-starburst':
            return p.starburstAmount === 0;
        case 'lens-dirt':
            return p.lensDirtAmount === 0;
        case 'lens-ghosts':
            return p.lensGhostAmount === 0;
        case 'bokeh-bloom':
            return p.bokehAmount === 0;
        case 'gate-weave':
            return p.gateWeaveAmount === 0;
        case 'film-damage':
            return p.filmDamageAmount === 0;
        case 'radial-blur':
            return p.radialBlurAmount === 0;
        case 'spin-blur':
            return p.spinBlurAmount === 0;
        case 'directional-blur':
            return p.directionalBlurAmount === 0;
        case 'rolling-shutter':
            return p.rollingShutterAmount === 0;
        case 'heat-haze':
            return p.heatHazeAmount === 0;
        case 'prism-dispersion':
            return p.prismAmount === 0;
        case 'kaleidoscope':
            return p.kaleidoscopeAmount === 0;
        case 'datamosh':
            return p.datamoshAmount === 0;
        case 'scanline-displacement':
            return p.scanlineAmount === 0;
    }
}
