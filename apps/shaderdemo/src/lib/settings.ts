import { persistentAtom } from '@nanostores/persistent';
import {
    FIELD_PARAMETER_SCHEMA,
    OCTAVE_BLUR_SCHEMA,
    OCTAVE_PARAMETER_SCHEMA,
    OCTAVE_PIXELATE_SCHEMA,
    PARAMETER_SCHEMA,
    POST_PARAMETER_SCHEMA,
    type ShaderParameters,
} from './renderer';
import { sanitizeAdjustments, type Adjustment } from './adjustments';
import defaultSettingsFixture from './default-settings.json';

export interface SavedShaderSettings {
    seed: number;
    parameters: ShaderParameters;
    adjustments: Adjustment[];
}

const canonicalSettings = defaultSettingsFixture.settings as unknown as SavedShaderSettings;

/** Return an isolated copy so consumers can freely mutate nested adjustment points. */
const initialSettings = (): SavedShaderSettings => JSON.parse(JSON.stringify(canonicalSettings)) as SavedShaderSettings;

export const defaultShaderSettings = initialSettings;

// v3 intentionally starts every existing browser from the newest exported canonical preset once,
// then continues persisting edits normally from that point onward.
export const SETTINGS_STORAGE_KEY = 'shaderdemo:settings:v3';
export const shaderSettings = persistentAtom<SavedShaderSettings>(SETTINGS_STORAGE_KEY, initialSettings(), {
    encode: JSON.stringify,
    decode: JSON.parse,
});

export type SettingsTab = 'field' | 'octaves' | 'adjustments' | 'post';

/** Reset only the controls represented by one visible settings tab. */
export function resetSettingsTab(settings: SavedShaderSettings, tab: SettingsTab): SavedShaderSettings {
    const defaults = initialSettings();
    if (tab === 'adjustments') return { ...settings, adjustments: defaults.adjustments };

    const parameters = { ...settings.parameters };
    const schema =
        tab === 'field'
            ? FIELD_PARAMETER_SCHEMA
            : tab === 'post'
              ? POST_PARAMETER_SCHEMA
              : [...OCTAVE_PARAMETER_SCHEMA.flat(), ...OCTAVE_PIXELATE_SCHEMA, ...OCTAVE_BLUR_SCHEMA];
    for (const parameter of schema) parameters[parameter.key] = parameter.default;
    return { ...settings, parameters };
}

export function serializeShaderSettings(settings: SavedShaderSettings): string {
    return JSON.stringify(
        {
            format: 'mia-cx-shaderdemo-settings',
            version: 1,
            settings,
        },
        null,
        2,
    );
}

export function normalizeSavedSettings(saved: Partial<SavedShaderSettings> | undefined): SavedShaderSettings {
    const defaults = initialSettings();
    const parameters = { ...defaults.parameters };

    for (const parameter of PARAMETER_SCHEMA) {
        const value = saved?.parameters?.[parameter.key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            const clamped = Math.min(parameter.max, Math.max(parameter.min, value));
            parameters[parameter.key] = parameter.key.endsWith('BlendMode') ? Math.round(clamped) : clamped;
        }
    }

    return {
        seed: typeof saved?.seed === 'number' && Number.isFinite(saved.seed) ? saved.seed : defaults.seed,
        parameters,
        adjustments: sanitizeAdjustments(saved?.adjustments),
    };
}
