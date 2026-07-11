import { describe, expect, it } from 'vitest';
import {
    BASE_SHADER_SOURCE,
    BLUR_SHADER_SOURCE,
    COMMON_SHADER_SOURCE,
    FIELD_PARAMETER_SCHEMA,
    OCTAVE_BLUR_SCHEMA,
    OCTAVE_COUNT,
    OCTAVE_PARAMETER_SCHEMA,
    OCTAVE_PIXELATE_SCHEMA,
    PARAMETER_SCHEMA,
    UNIFORM_FLOATS,
    advanceSimulationTime,
    defaultParameters,
    fullResolutionPassSizes,
    octavePixelSizes,
    octaveBlurIsActive,
    octaveEffectIsActive,
    packUniform,
    renderSize,
    scaledSize,
} from './renderer';
import { normalizeSavedSettings } from './settings';

describe('field configuration', () => {
    it('uses seeded 3D simplex gradients instead of synchronized Z-slice interpolation', () => {
        expect(COMMON_SHADER_SOURCE).toContain('fn simplexGradient');
        expect(COMMON_SHADER_SOURCE).toContain('fn simplexCorner');
        expect(COMMON_SHADER_SOURCE).toContain('kernel*kernel*kernel*kernel');
        expect(COMMON_SHADER_SOURCE).not.toContain('mix(z0,z1,f.z)');
    });
    it('uses separate salted simplex fields for each remaining cloud and ribbon', () => {
        expect(COMMON_SHADER_SOURCE).toContain('fn hash3(p: vec3f, seedSalt: f32)');
        expect(COMMON_SHADER_SOURCE).toContain('u.seed*19.19 + seedSalt*53.17');
        expect(COMMON_SHADER_SOURCE).toContain('hash3(lattice,seedSalt)');

        const fieldSamples = [
            'noise3(primaryPosition,307.)',
            'noise3(primaryPosition,401.)',
            'noise3(secondaryPosition,503.)',
            'noise3(secondaryPosition,601.)',
        ];
        fieldSamples.forEach((sample) => expect(BASE_SHADER_SOURCE).toContain(sample));
        expect(new Set(fieldSamples.map((sample) => sample.match(/,(\d+)\./)?.[1])).size).toBe(4);
        expect(BASE_SHADER_SOURCE).not.toContain('tertiary');
    });
    it('caps DPR and rounds down to stable physical dimensions', () => {
        expect(renderSize(801.9, 600.8, 3, 1.5)).toEqual({ width: 1202, height: 901 });
        expect(renderSize(801.9, 600.8, 3, Number.POSITIVE_INFINITY)).toEqual({ width: 2405, height: 1802 });
        expect(renderSize(0, 0, 2, 1)).toEqual({ width: 1, height: 1 });
    });
    it('keeps scaled render targets valid', () => {
        expect(scaledSize(1202, 901, 0.5)).toEqual({ width: 601, height: 450 });
        expect(scaledSize(0, 0, 0.5)).toEqual({ width: 1, height: 1 });
    });
    it('keeps the base and all five octave effect stages full resolution', () => {
        expect(OCTAVE_COUNT).toBe(5);
        expect(octavePixelSizes()).toEqual([16, 8, 4, 2, 1]);
        expect(fullResolutionPassSizes(1202, 901, 1)).toEqual(
            Array.from({ length: 6 }, () => ({ width: 1202, height: 901 })),
        );
        expect(fullResolutionPassSizes(1202, 901, 0.5)).toEqual(
            Array.from({ length: 6 }, () => ({ width: 601, height: 450 })),
        );
    });
    it('changes evolution rate without changing the current phase', () => {
        expect(advanceSimulationTime(12, 0, 3)).toBe(12);
        expect(advanceSimulationTime(12, 0.5, 1)).toBe(12.5);
        expect(advanceSimulationTime(12, 0.5, 3)).toBe(13.5);
    });
    it('defines five independent groups of four valid controls', () => {
        expect(FIELD_PARAMETER_SCHEMA).toHaveLength(26);
        expect(OCTAVE_PARAMETER_SCHEMA).toHaveLength(5);
        OCTAVE_PARAMETER_SCHEMA.forEach((group) => expect(group).toHaveLength(4));
        expect(OCTAVE_PIXELATE_SCHEMA).toHaveLength(5);
        expect(OCTAVE_BLUR_SCHEMA).toHaveLength(5);
        expect(PARAMETER_SCHEMA).toHaveLength(56);
        expect(new Set(PARAMETER_SCHEMA.map(({ key }) => key)).size).toBe(56);
        for (const parameter of PARAMETER_SCHEMA) {
            expect(parameter.min).toBeLessThan(parameter.max);
            expect(parameter.step).toBeGreaterThan(0);
            expect(parameter.default).toBeGreaterThanOrEqual(parameter.min);
            expect(parameter.default).toBeLessThanOrEqual(parameter.max);
            expect(defaultParameters()[parameter.key]).toBe(parameter.default);
        }
        expect(defaultParameters().centerDarkness).toBe(0);
        expect(defaultParameters().thresholdEnabled).toBe(1);
        expect(defaultParameters()).toMatchObject({
            baseCloudBlendMode: 0,
            baseRibbonBlendMode: 0,
            secondaryEnabled: 1,
            secondaryScale: 1.1,
            secondaryCloudAmount: 0,
            secondaryRibbonAmount: 0,
            secondaryRibbonSharpness: 1.76,
            secondaryCloudBlendMode: 0,
            secondaryRibbonBlendMode: 0,
        });
        for (const key of ['billowAmount', 'ridgeAmount', 'secondaryCloudAmount', 'secondaryRibbonAmount'] as const) {
            expect(FIELD_PARAMETER_SCHEMA.find((parameter) => parameter.key === key)?.min).toBe(-2);
        }
        expect(OCTAVE_PARAMETER_SCHEMA.map((group) => group[0].default)).toEqual(Array(5).fill(0));
        expect(OCTAVE_PARAMETER_SCHEMA.map((group) => group[3].default)).toEqual(Array(5).fill(0));
        expect(OCTAVE_PIXELATE_SCHEMA.map(({ default: value }) => value)).toEqual(Array(5).fill(0));
        expect(OCTAVE_BLUR_SCHEMA.map(({ default: value }) => value)).toEqual(Array(5).fill(0.25));
    });
    it('ignores stale persisted sixth and seventh octave keys', () => {
        const saved = {
            ...defaultParameters(),
            octave6Noise: 0.4,
            octave7Pixelate: 1,
        } as ReturnType<typeof defaultParameters>;
        const normalized = normalizeSavedSettings({ seed: 7, parameters: saved });
        expect('octave6Noise' in normalized.parameters).toBe(false);
        expect('octave7Pixelate' in normalized.parameters).toBe(false);
    });
    it('ignores stale persisted tertiary keys while preserving remaining settings', () => {
        const saved = {
            ...defaultParameters(),
            secondaryScale: 2.25,
            tertiaryEnabled: 1,
            tertiaryScale: 4.5,
            tertiaryCloudAmount: 1.2,
            tertiaryRibbonAmount: -0.8,
            tertiaryRibbonSharpness: 3,
            tertiaryBlendMode: 2,
        } as ReturnType<typeof defaultParameters>;
        const normalized = normalizeSavedSettings({ seed: 7, parameters: saved });
        expect(normalized.parameters.secondaryScale).toBe(2);
        expect(Object.keys(normalized.parameters).some((key) => key.startsWith('tertiary'))).toBe(false);
    });
    it('defaults old saved settings to Add and normalizes categorical modes', () => {
        const oldParameters = { baseBlendMode: 2, secondaryBlendMode: 1 } as unknown as ReturnType<
            typeof defaultParameters
        >;
        const old = normalizeSavedSettings({ seed: 7, parameters: oldParameters });
        expect('baseBlendMode' in old.parameters).toBe(false);
        expect('secondaryBlendMode' in old.parameters).toBe(false);
        expect([
            old.parameters.baseCloudBlendMode,
            old.parameters.baseRibbonBlendMode,
            old.parameters.secondaryCloudBlendMode,
            old.parameters.secondaryRibbonBlendMode,
        ]).toEqual([0, 0, 0, 0]);

        const parameters = defaultParameters();
        parameters.baseCloudBlendMode = 2.6;
        parameters.baseRibbonBlendMode = 1.4;
        parameters.secondaryCloudBlendMode = -4;
        parameters.secondaryRibbonBlendMode = 9;
        const normalized = normalizeSavedSettings({ seed: 7, parameters });
        expect([
            normalized.parameters.baseCloudBlendMode,
            normalized.parameters.baseRibbonBlendMode,
            normalized.parameters.secondaryCloudBlendMode,
            normalized.parameters.secondaryRibbonBlendMode,
        ]).toEqual([3, 1, 0, 3]);
    });
    it('packs the aligned uniform header and array<vec4f, 5>', () => {
        const parameters = defaultParameters();
        parameters.octave1Pixelate = 1;
        parameters.octave3Pixelate = 1;
        const data = packUniform([320, 180], 2, 9, parameters, 4);
        expect(data).toHaveLength(UNIFORM_FLOATS);
        expect(data.byteLength).toBe(240);
        expect(data[30]).toBe(4);
        expect(data[31]).toBe(5);
        expect(Array.from(data.slice(32, 36))).toEqual(
            Array.from(
                new Float32Array([
                    parameters.octave1Noise,
                    parameters.octave1Threshold,
                    parameters.octave1Smoothness,
                    parameters.octave1Distance,
                ]),
            ),
        );
        expect(Array.from(data.slice(52, 57))).toEqual(Array(5).fill(0.25));
        expect(Array.from(data.slice(57, 60))).toEqual([0, 0, 0]);
    });
    it('uses a dynamic radius and four diagonal samples with an exact zero-radius identity', () => {
        expect(BLUR_SHADER_SOURCE).toContain('exp2(4.-u.octaveIndex)');
        expect(BLUR_SHADER_SOURCE).toContain('u.blurRadii[radiusIndex/4u][radiusIndex%4u]');
        expect(BLUR_SHADER_SOURCE).toContain('if(radius<=0.0001)');
        expect(BLUR_SHADER_SOURCE.match(/textureSample\(/g)).toHaveLength(5);
    });
    it('skips neutral octave work while smoothness alone remains neutral', () => {
        const parameters = defaultParameters();
        expect(octaveEffectIsActive(parameters, 0)).toBe(false);
        parameters.octave1Smoothness = 1;
        expect(octaveEffectIsActive(parameters, 0)).toBe(false);
        for (const key of ['octave1Noise', 'octave1Threshold', 'octave1Distance', 'octave1Pixelate'] as const) {
            const active = { ...parameters, [key]: key === 'octave1Threshold' ? -0.1 : 1 };
            expect(octaveEffectIsActive(active, 0)).toBe(true);
        }
        expect(octaveBlurIsActive(parameters, 0)).toBe(true);
        parameters.octave1BlurRadius = 0;
        expect(octaveBlurIsActive(parameters, 0)).toBe(false);
    });
    it('composes four independent ordered layers with signed blend modes before attenuation and threshold', () => {
        expect(BASE_SHADER_SOURCE).toContain('fn screen01');
        expect(BASE_SHADER_SOURCE).toContain('fn overlay01');
        expect(BASE_SHADER_SOURCE).toContain('fn blendLayer(backdrop: f32, source: f32, amount: f32, mode: f32)');
        expect(BASE_SHADER_SOURCE).toContain('if(amount==0.) { return backdrop; }');
        expect(BASE_SHADER_SOURCE).toContain('backdrop-source*amount');
        expect(BASE_SHADER_SOURCE).toContain('var natural=blendLayer(0.,cloud,u.billowAmount,u.baseCloudBlendMode)');
        expect(BASE_SHADER_SOURCE).toContain('natural=blendLayer(natural,ribbon,u.ridgeAmount,u.baseRibbonBlendMode)');
        expect(BASE_SHADER_SOURCE).toContain(
            'natural=blendLayer(natural,secondaryCloud,u.secondaryCloudAmount,u.secondaryCloudBlendMode)',
        );
        expect(BASE_SHADER_SOURCE).toContain(
            'natural=blendLayer(natural,secondaryRibbon,u.secondaryRibbonAmount,u.secondaryRibbonBlendMode)',
        );
        expect(BASE_SHADER_SOURCE).not.toContain('secondaryShaped');
        expect(BASE_SHADER_SOURCE).toContain('if(u.secondaryEnabled>=.5)');
        expect(BASE_SHADER_SOURCE).toContain('fn smoothAbsFold');
        expect(BASE_SHADER_SOURCE.indexOf('natural=blendLayer')).toBeLessThan(
            BASE_SHADER_SOURCE.indexOf('natural*=centerAttenuation'),
        );
    });
    it('can bypass the stage-one threshold to expose the raw field', () => {
        expect(BASE_SHADER_SOURCE).toContain('select(natural,thresholded,u.thresholdEnabled>=.5)');
    });
});
