import { persistentAtom } from '@nanostores/persistent';
import {
    FIELD_PARAMETER_SCHEMA,
    OCTAVE_BLUR_SCHEMA,
    OCTAVE_PARAMETER_SCHEMA,
    OCTAVE_PIXELATE_SCHEMA,
    PARAMETER_SCHEMA,
    defaultParameters,
    type ShaderParameters,
} from './renderer';
import { sanitizeAdjustments, type Adjustment } from './adjustments';

export interface SavedShaderSettings {
    seed: number;
    parameters: ShaderParameters;
    adjustments: Adjustment[];
}

const initialSettings = (): SavedShaderSettings => ({
    seed: 4.2,
    parameters: defaultParameters(),
    adjustments: [],
});

export const defaultShaderSettings = initialSettings;

export const shaderSettings = persistentAtom<SavedShaderSettings>('shaderdemo:settings:v1', initialSettings(), {
    encode: JSON.stringify,
    decode: JSON.parse,
});

export type SettingsTab = 'field' | 'octaves' | 'adjustments';

/** Reset only the controls represented by one visible settings tab. */
export function resetSettingsTab(settings: SavedShaderSettings, tab: SettingsTab): SavedShaderSettings {
    const defaults = initialSettings();
    if (tab === 'adjustments') return { ...settings, adjustments: defaults.adjustments };

    const parameters = { ...settings.parameters };
    const schema =
        tab === 'field'
            ? FIELD_PARAMETER_SCHEMA
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
