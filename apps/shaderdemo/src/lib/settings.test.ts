import { describe, expect, it } from 'vitest';
import fixture from './default-settings.json';
import { newCurve } from './adjustments';
import { defaultParameters, FIELD_PARAMETER_SCHEMA, PARAMETER_SCHEMA } from './renderer';
import {
    SETTINGS_STORAGE_KEY,
    defaultShaderSettings,
    resetSettingsTab,
    serializeShaderSettings,
    type SavedShaderSettings,
} from './settings';

const fixtureParameters = fixture.settings.parameters as Record<string, number>;

function tuned(): SavedShaderSettings {
    const parameters = defaultParameters();
    parameters.fieldScale = 321;
    parameters.octave1Noise = 0.25;
    return { seed: 999, parameters, adjustments: [newCurve()] };
}

describe('canonical defaults', () => {
    it('loads the exact complete exported settings', () => {
        const defaults = defaultShaderSettings();
        expect(defaults.seed).toBe(496.02595502997605);
        expect(defaults.parameters).toEqual(fixture.settings.parameters);
        expect(defaultParameters()).toEqual(fixture.settings.parameters);
        expect(defaults.adjustments).toEqual(fixture.settings.adjustments);
        expect(defaults.adjustments.map(({ id, type }) => ({ id, type }))).toEqual(
            fixture.settings.adjustments.map(({ id, type }) => ({ id, type })),
        );
        expect(PARAMETER_SCHEMA.every(({ key, default: value }) => value === fixtureParameters[key])).toBe(true);
    });

    it('returns fresh deep copies without exposing canonical or prior state', () => {
        const first = defaultShaderSettings();
        const second = defaultShaderSettings();
        expect(first).not.toBe(second);
        expect(first.parameters).not.toBe(second.parameters);
        expect(first.adjustments).not.toBe(second.adjustments);
        expect(first.adjustments[0]).not.toBe(second.adjustments[0]);
        if (first.adjustments[0].type === 'curve' && first.adjustments[0].mode === 'rgb')
            first.adjustments[0].channels.r[0].y = 123;
        first.parameters.fieldScale = 32;
        expect(defaultShaderSettings()).toEqual(fixture.settings);
    });
});

describe('tab-scoped settings reset', () => {
    it('uses a fresh persistence generation for the exported canonical preset', () => {
        expect(SETTINGS_STORAGE_KEY).toBe('shaderdemo:settings:v2');
    });

    it('restores exactly Field without touching Octaves, adjustments, or seed', () => {
        const settings = tuned();
        const reset = resetSettingsTab(settings, 'field');
        for (const { key } of FIELD_PARAMETER_SCHEMA) expect(reset.parameters[key]).toBe(fixtureParameters[key]);
        expect(reset.parameters.octave1Noise).toBe(0.25);
        expect(reset.adjustments).toBe(settings.adjustments);
        expect(reset.seed).toBe(999);
    });

    it('restores exactly Octaves without touching Field, adjustments, or seed', () => {
        const settings = tuned();
        const reset = resetSettingsTab(settings, 'octaves');
        for (const { key } of PARAMETER_SCHEMA.filter(({ key }) => key.startsWith('octave')))
            expect(reset.parameters[key]).toBe(fixtureParameters[key]);
        expect(reset.parameters.fieldScale).toBe(321);
        expect(reset.adjustments).toBe(settings.adjustments);
        expect(reset.seed).toBe(999);
    });

    it('restores a fresh full adjustment stack without touching parameters or seed', () => {
        const settings = tuned();
        const first = resetSettingsTab(settings, 'adjustments');
        const second = resetSettingsTab(settings, 'adjustments');
        expect(first.adjustments).toEqual(fixture.settings.adjustments);
        expect(first.adjustments).not.toBe(second.adjustments);
        expect(first.parameters).toBe(settings.parameters);
        expect(first.seed).toBe(999);
        first.adjustments.pop();
        expect(second.adjustments).toEqual(fixture.settings.adjustments);
        expect(defaultShaderSettings().adjustments).toEqual(fixture.settings.adjustments);
    });

    it('exports canonical settings after all tabs reset, while retaining the current seed', () => {
        let settings = tuned();
        settings = resetSettingsTab(settings, 'field');
        settings = resetSettingsTab(settings, 'octaves');
        settings = resetSettingsTab(settings, 'adjustments');
        expect(JSON.parse(serializeShaderSettings(settings))).toEqual({
            format: fixture.format,
            version: fixture.version,
            settings: { ...fixture.settings, seed: 999 },
        });
    });
});
