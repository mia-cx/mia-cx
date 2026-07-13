import { describe, expect, it } from 'vitest';
import fixture from './default-settings.json';
import { POST_KINDS } from './pipeline';
import {
    SETTINGS_STORAGE_KEY,
    defaultShaderSettings,
    loadPersistedSettings,
    normalizeSavedSettings,
    parseSettingsDocument,
    resetSettingsTab,
    serializeShaderSettings,
} from './settings';

describe('V2 pipeline settings', () => {
    it('returns independent complete canonical copies', () => {
        const a = defaultShaderSettings(),
            b = defaultShaderSettings();
        expect(a.seed).toEqual(fixture.settings.seed);
        expect(a).not.toBe(b);
        expect(a.colour).not.toBe(b.colour);
        expect(a.colour).toHaveLength(11);
        expect(a.colour.at(-1)?.type).toBe('colour-grade');
        expect(a.post).toHaveLength(POST_KINDS.length);
        expect(new Set(a.post.map((x) => x.type))).toEqual(new Set(POST_KINDS));
    });
    it('exports and parses the complete V2 document', () => {
        const settings = defaultShaderSettings();
        const doc = JSON.parse(serializeShaderSettings(settings));
        expect(doc).toEqual({ format: 'mia-cx-shaderdemo-settings', version: 2, settings, assets: [] });
        expect(parseSettingsDocument(doc)).toEqual(settings);
    });
    it('drops superseded cursor density keys from defaults, cursor resets, and exports', () => {
        const oldKeys = ['cursorDensity' + 'HighlightProtection', 'cursorDensity' + 'MidtoneFocus'];
        const settings = defaultShaderSettings();
        expect(settings.parameters.cursorDensityDarkBias).toBe(1);
        for (const oldKey of oldKeys) {
            expect(oldKey in settings.parameters).toBe(false);
            (settings.parameters as Record<string, number>)[oldKey] = 3;
        }
        const reset = resetSettingsTab(settings, 'cursor').parameters;
        const exported = JSON.parse(serializeShaderSettings(settings)).settings.parameters;
        for (const oldKey of oldKeys) {
            expect(oldKey in reset).toBe(false);
            expect(oldKey in exported).toBe(false);
        }
    });
    it('uses a new persistence generation and migrates v1/v3 shapes', () => {
        expect(SETTINGS_STORAGE_KEY).toBe('shaderdemo:settings:v8');
        const legacy = { seed: 42, parameters: { ...defaultShaderSettings().parameters }, adjustments: [] };
        const storage = { getItem: (key: string) => (key.endsWith(':v3') ? JSON.stringify(legacy) : null) };
        const migrated = loadPersistedSettings(storage);
        expect(migrated.seed).toBe(42);
        expect(migrated.colour.at(-1)?.type).toBe('colour-grade');
        expect(migrated.post).toHaveLength(POST_KINDS.length);
    });
    it('preserves stable IDs and order when normalizing V2', () => {
        const value = defaultShaderSettings();
        value.post.reverse();
        value.post[0].enabled = false;
        const normalized = normalizeSavedSettings(value);
        expect(normalized.post.map((x) => x.id)).toEqual(value.post.map((x) => x.id));
        expect(normalized.post[0].enabled).toBe(false);
    });
    it('resets Colour and Post independently with fresh arrays', () => {
        const value = defaultShaderSettings();
        value.parameters.cursorEnabled = 1;
        value.parameters.cursorDensityRadius = 1.73;
        value.parameters.cursorDensityDarkBias = 2.4;
        const colour = resetSettingsTab(value, 'colour');
        const post = resetSettingsTab(value, 'post');
        expect(colour.colour).toEqual(defaultShaderSettings().colour);
        expect(colour.colour).not.toBe(value.colour);
        expect(post.post).toEqual(defaultShaderSettings().post);
        expect(post.post).not.toBe(value.post);
        expect(post.colour).toBe(value.colour);
        expect(post.parameters.cursorEnabled).toBe(1);
        expect(post.parameters.cursorDensityRadius).toBe(1.73);
        expect(post.parameters.cursorDensityDarkBias).toBe(2.4);
    });
});
