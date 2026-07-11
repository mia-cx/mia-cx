import { describe, expect, it } from 'vitest';
import { newCurve } from './adjustments';
import { defaultParameters } from './renderer';
import { resetSettingsTab, serializeShaderSettings, type SavedShaderSettings } from './settings';

function tuned(): SavedShaderSettings {
    const parameters = defaultParameters();
    parameters.fieldScale = 321;
    parameters.octave1Noise = 0.25;
    return { seed: 999, parameters, adjustments: [newCurve()] };
}

describe('tab-scoped settings reset', () => {
    it('resets Field without touching Octaves, adjustments, or seed', () => {
        const settings = tuned();
        const reset = resetSettingsTab(settings, 'field');
        expect(reset.parameters.fieldScale).toBe(defaultParameters().fieldScale);
        expect(reset.parameters.octave1Noise).toBe(0.25);
        expect(reset.adjustments).toBe(settings.adjustments);
        expect(reset.seed).toBe(999);
    });

    it('resets Octaves without touching Field, adjustments, or seed', () => {
        const settings = tuned();
        const reset = resetSettingsTab(settings, 'octaves');
        expect(reset.parameters.octave1Noise).toBe(defaultParameters().octave1Noise);
        expect(reset.parameters.fieldScale).toBe(321);
        expect(reset.adjustments).toBe(settings.adjustments);
        expect(reset.seed).toBe(999);
    });

    it('clears adjustments without touching parameters or seed', () => {
        const settings = tuned();
        const reset = resetSettingsTab(settings, 'adjustments');
        expect(reset.adjustments).toEqual([]);
        expect(reset.parameters).toBe(settings.parameters);
        expect(reset.seed).toBe(999);
    });

    it('exports the complete current stack in a versioned JSON format', () => {
        const settings = tuned();
        expect(JSON.parse(serializeShaderSettings(settings))).toEqual({
            format: 'mia-cx-shaderdemo-settings',
            version: 1,
            settings,
        });
    });
});
