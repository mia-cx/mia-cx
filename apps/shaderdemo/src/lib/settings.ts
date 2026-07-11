import { persistentAtom } from '@nanostores/persistent';
import { PARAMETER_SCHEMA, defaultParameters, type ShaderParameters } from './renderer';
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
