import { persistentAtom } from '@nanostores/persistent';
import {
    FIELD_PARAMETER_SCHEMA,
    OCTAVE_BLUR_SCHEMA,
    OCTAVE_PARAMETER_SCHEMA,
    OCTAVE_PIXELATE_SCHEMA,
    PARAMETER_SCHEMA,
    type ShaderParameters,
} from './renderer';
import {
    ensureGradeLast,
    migrateColour,
    migratePost,
    sanitizeColour,
    syncPipelineToggles,
    POST_KINDS,
    stablePipelineId,
    type ColourEffect,
    type PostEffect,
} from './pipeline';
import { isRgbColour } from './colour-effects';
import defaultSettingsFixture from './default-settings.json';
import { CURSOR_PARAMETER_SCHEMA } from './cursor-schema';

export interface SavedShaderSettings {
    seed: number;
    parameters: ShaderParameters;
    colour: ColourEffect[];
    post: PostEffect[];
}
export interface ExternalAssetReference {
    type: 'cube-lut';
    id: string;
    name?: string;
    portability: 'external-browser-asset-not-embedded';
}
export interface SettingsDocument {
    format: 'mia-cx-shaderdemo-settings';
    version: 2;
    settings: SavedShaderSettings;
    assets: ExternalAssetReference[];
}
type LegacySettings = Partial<SavedShaderSettings> & { adjustments?: unknown };
const canonicalSettings = defaultSettingsFixture.settings as unknown as SavedShaderSettings;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const defaultShaderSettings = () => {
    const value = clone(canonicalSettings);
    for (const parameter of PARAMETER_SCHEMA)
        if (typeof value.parameters[parameter.key] !== 'number') value.parameters[parameter.key] = parameter.default;
    for (const type of POST_KINDS)
        if (!value.post.some((effect) => effect.type === type))
            value.post.push({ id: stablePipelineId('post', type), type, enabled: false });
    return value;
};
export const SETTINGS_STORAGE_KEY = 'shaderdemo:settings:v7';
export const LEGACY_STORAGE_KEYS = [
    'shaderdemo:settings:v6',
    'shaderdemo:settings:v3',
    'shaderdemo:settings:v2',
    'shaderdemo:settings:v1',
] as const;
export const shaderSettings = persistentAtom<SavedShaderSettings>(SETTINGS_STORAGE_KEY, defaultShaderSettings(), {
    encode: JSON.stringify,
    decode: JSON.parse,
});
export type SettingsTab = 'field' | 'cursor' | 'octaves' | 'colour' | 'adjustments' | 'post';
export function resetSettingsTab(settings: SavedShaderSettings, tab: SettingsTab): SavedShaderSettings {
    const defaults = defaultShaderSettings();
    if (tab === 'colour' || tab === 'adjustments') return { ...settings, colour: clone(defaults.colour) };
    if (tab === 'post')
        return {
            ...settings,
            post: clone(defaults.post),
            parameters: {
                ...settings.parameters,
                ...Object.fromEntries(
                    PARAMETER_SCHEMA.filter(
                        (x) =>
                            !FIELD_PARAMETER_SCHEMA.includes(x as never) &&
                            !OCTAVE_PARAMETER_SCHEMA.flat().includes(x as never) &&
                            !OCTAVE_PIXELATE_SCHEMA.includes(x as never) &&
                            !OCTAVE_BLUR_SCHEMA.includes(x as never),
                    ).map((x) => [x.key, x.default]),
                ),
            } as ShaderParameters,
        };
    const schema =
        tab === 'field'
            ? FIELD_PARAMETER_SCHEMA
            : tab === 'cursor'
              ? CURSOR_PARAMETER_SCHEMA
              : [...OCTAVE_PARAMETER_SCHEMA.flat(), ...OCTAVE_PIXELATE_SCHEMA, ...OCTAVE_BLUR_SCHEMA];
    const parameters = { ...settings.parameters };
    for (const p of schema) parameters[p.key] = p.default;
    return { ...settings, parameters };
}
export function serializeShaderSettings(settings: SavedShaderSettings): string {
    const assets: ExternalAssetReference[] = settings.colour.flatMap((effect) =>
        isRgbColour(effect) && effect.type === 'lut' && effect.assetId
            ? [
                  {
                      type: 'cube-lut',
                      id: effect.assetId,
                      name: effect.assetName,
                      portability: 'external-browser-asset-not-embedded',
                  },
              ]
            : [],
    );
    return JSON.stringify({ format: 'mia-cx-shaderdemo-settings', version: 2, settings, assets }, null, 2);
}
export function parseSettingsDocument(value: unknown): SavedShaderSettings {
    const document = value as { format?: string; version?: number; settings?: LegacySettings };
    if (document?.format !== 'mia-cx-shaderdemo-settings' || !document.settings)
        throw new Error('Not a shaderdemo settings document.');
    return normalizeSavedSettings(document.settings);
}
export function normalizeSavedSettings(saved: LegacySettings | undefined): SavedShaderSettings {
    const defaults = defaultShaderSettings(),
        parameters = { ...defaults.parameters };
    for (const parameter of PARAMETER_SCHEMA) {
        let value = saved?.parameters?.[parameter.key];
        if (parameter.key === 'temperature' && typeof value === 'number' && value >= -1 && value <= 1)
            value = 6500 + value * 2000;
        if (typeof value === 'number' && Number.isFinite(value))
            parameters[parameter.key] = parameter.key.endsWith('BlendMode')
                ? Math.round(Math.min(parameter.max, Math.max(parameter.min, value)))
                : Math.min(parameter.max, Math.max(parameter.min, value));
    }
    let colour = Array.isArray(saved?.colour)
        ? sanitizeColour(saved.colour, defaults.colour)
        : migrateColour(saved?.adjustments, parameters);
    colour = ensureGradeLast(colour);
    const post = Array.isArray(saved?.post) ? clone(saved.post) : migratePost(parameters);
    return {
        seed: typeof saved?.seed === 'number' && Number.isFinite(saved.seed) ? saved.seed : defaults.seed,
        parameters: syncPipelineToggles(parameters, colour, post),
        colour,
        post,
    };
}
/** Read v7 first, then migrate older compatible browser generations without discarding edits. */
export function loadPersistedSettings(storage: Pick<Storage, 'getItem'>): SavedShaderSettings {
    for (const key of [SETTINGS_STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
        const raw = storage.getItem(key);
        if (!raw) continue;
        try {
            const parsed = JSON.parse(raw);
            return normalizeSavedSettings(parsed?.settings ?? parsed);
        } catch {}
    }
    return defaultShaderSettings();
}
