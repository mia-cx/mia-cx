import { describe, expect, it } from 'vitest';
import {
    BASE_SHADER_SOURCE,
    COMMON_SHADER_SOURCE,
    FIELD_PARAMETER_SCHEMA,
    OCTAVE_COUNT,
    OCTAVE_PARAMETER_SCHEMA,
    OCTAVE_PIXELATE_SCHEMA,
    PARAMETER_SCHEMA,
    UNIFORM_FLOATS,
    advanceSimulationTime,
    defaultParameters,
    fullResolutionPassSizes,
    octavePixelSizes,
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
    it('uses separate salted simplex fields for every cloud and ribbon', () => {
        expect(COMMON_SHADER_SOURCE).toContain('fn hash3(p: vec3f, seedSalt: f32)');
        expect(COMMON_SHADER_SOURCE).toContain('u.seed*19.19 + seedSalt*53.17');
        expect(COMMON_SHADER_SOURCE).toContain('hash3(lattice,seedSalt)');

        const fieldSamples = [
            'noise3(primaryPosition,307.)',
            'noise3(primaryPosition,401.)',
            'noise3(secondaryPosition,503.)',
            'noise3(secondaryPosition,601.)',
            'noise3(tertiaryPosition,701.)',
            'noise3(tertiaryPosition,809.)',
        ];
        fieldSamples.forEach((sample) => expect(BASE_SHADER_SOURCE).toContain(sample));
        expect(new Set(fieldSamples.map((sample) => sample.match(/,(\d+)\./)?.[1])).size).toBe(6);
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
    it('keeps the base and all seven octave stages full resolution', () => {
        expect(OCTAVE_COUNT).toBe(7);
        expect(octavePixelSizes()).toEqual([64, 32, 16, 8, 4, 2, 1]);
        expect(fullResolutionPassSizes(1202, 901, 1)).toEqual(
            Array.from({ length: 8 }, () => ({ width: 1202, height: 901 })),
        );
        expect(fullResolutionPassSizes(1202, 901, 0.5)).toEqual(
            Array.from({ length: 8 }, () => ({ width: 601, height: 450 })),
        );
    });
    it('changes evolution rate without changing the current phase', () => {
        expect(advanceSimulationTime(12, 0, 3)).toBe(12);
        expect(advanceSimulationTime(12, 0.5, 1)).toBe(12.5);
        expect(advanceSimulationTime(12, 0.5, 3)).toBe(13.5);
    });
    it('defines seven independent groups of four valid controls', () => {
        expect(FIELD_PARAMETER_SCHEMA).toHaveLength(29);
        expect(OCTAVE_PARAMETER_SCHEMA).toHaveLength(7);
        OCTAVE_PARAMETER_SCHEMA.forEach((group) => expect(group).toHaveLength(4));
        expect(OCTAVE_PIXELATE_SCHEMA).toHaveLength(7);
        expect(PARAMETER_SCHEMA).toHaveLength(64);
        expect(new Set(PARAMETER_SCHEMA.map(({ key }) => key)).size).toBe(64);
        for (const parameter of PARAMETER_SCHEMA) {
            expect(parameter.min).toBeLessThan(parameter.max);
            expect(parameter.step).toBeGreaterThan(0);
            expect(parameter.default).toBeGreaterThanOrEqual(parameter.min);
            expect(parameter.default).toBeLessThanOrEqual(parameter.max);
            expect(defaultParameters()[parameter.key]).toBe(parameter.default);
        }
        expect(defaultParameters().centerDarkness).toBe(0);
        expect(defaultParameters()).toMatchObject({
            baseBlendMode: 0,
            secondaryEnabled: 1,
            secondaryScale: 1.1,
            secondaryCloudAmount: 0,
            secondaryRibbonAmount: 0,
            secondaryRibbonSharpness: 1.76,
            secondaryBlendMode: 0,
            tertiaryEnabled: 1,
            tertiaryScale: 2.035,
            tertiaryCloudAmount: 0,
            tertiaryRibbonAmount: 0,
            tertiaryRibbonSharpness: 1.76,
            tertiaryBlendMode: 0,
        });
        for (const key of [
            'billowAmount',
            'ridgeAmount',
            'secondaryCloudAmount',
            'secondaryRibbonAmount',
            'tertiaryCloudAmount',
            'tertiaryRibbonAmount',
        ] as const) {
            expect(FIELD_PARAMETER_SCHEMA.find((parameter) => parameter.key === key)?.min).toBe(-2);
        }
        expect(OCTAVE_PARAMETER_SCHEMA.map((group) => group[0].default)).toEqual(Array(7).fill(0));
        expect(OCTAVE_PARAMETER_SCHEMA.map((group) => group[3].default)).toEqual(Array(7).fill(0));
        expect(OCTAVE_PIXELATE_SCHEMA.map(({ default: value }) => value)).toEqual(Array(7).fill(0));
    });
    it('defaults old saved settings to Add and normalizes categorical modes', () => {
        const old = normalizeSavedSettings({ seed: 7, parameters: {} as ReturnType<typeof defaultParameters> });
        expect(old.parameters.baseBlendMode).toBe(0);
        expect(old.parameters.secondaryBlendMode).toBe(0);
        expect(old.parameters.tertiaryBlendMode).toBe(0);

        const parameters = defaultParameters();
        parameters.baseBlendMode = 1.6;
        parameters.secondaryBlendMode = -4;
        parameters.tertiaryBlendMode = 8;
        const normalized = normalizeSavedSettings({ seed: 7, parameters });
        expect([
            normalized.parameters.baseBlendMode,
            normalized.parameters.secondaryBlendMode,
            normalized.parameters.tertiaryBlendMode,
        ]).toEqual([2, 0, 2]);
    });
    it('packs the aligned uniform header and array<vec4f, 7>', () => {
        const parameters = defaultParameters();
        parameters.octave1Pixelate = 1;
        parameters.octave3Pixelate = 1;
        const data = packUniform([320, 180], 2, 9, parameters, 6);
        expect(data).toHaveLength(UNIFORM_FLOATS);
        expect(data.byteLength).toBe(256);
        expect(Array.from(data.slice(12, 24))).toEqual(
            Array.from(new Float32Array([1, 1.1, 0, 0, 1.76, 0, 1, 2.035, 0, 0, 1.76, 0])),
        );
        expect(data[33]).toBe(6);
        expect(data[34]).toBe(5);
        expect(data[35]).toBe(0);
        expect(Array.from(data.slice(36, 40))).toEqual(
            Array.from(
                new Float32Array([
                    parameters.octave1Noise,
                    parameters.octave1Threshold,
                    parameters.octave1Smoothness,
                    parameters.octave1Distance,
                ]),
            ),
        );
    });
    it('composes each generator with real signed blend modes before attenuation and threshold', () => {
        expect(BASE_SHADER_SOURCE).toContain('fn screen01');
        expect(BASE_SHADER_SOURCE).toContain('fn overlay01');
        expect(BASE_SHADER_SOURCE).toContain('fn blendSigned');
        expect(BASE_SHADER_SOURCE).toContain('blendSigned(cloud*u.billowAmount,ribbon*u.ridgeAmount,u.baseBlendMode)');
        expect(BASE_SHADER_SOURCE).toContain('natural=blendSigned(natural,secondaryShaped,u.secondaryBlendMode)');
        expect(BASE_SHADER_SOURCE).toContain('natural=blendSigned(natural,tertiaryShaped,u.tertiaryBlendMode)');
        expect(BASE_SHADER_SOURCE).toContain('if(u.secondaryEnabled>=.5)');
        expect(BASE_SHADER_SOURCE).toContain('fn smoothAbsFold');
        expect(BASE_SHADER_SOURCE.indexOf('natural=blendSigned')).toBeLessThan(
            BASE_SHADER_SOURCE.indexOf('natural*=centerAttenuation'),
        );
    });
});
