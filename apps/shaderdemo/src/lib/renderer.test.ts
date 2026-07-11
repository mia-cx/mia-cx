import { describe, expect, it } from 'vitest';
import {
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

describe('field configuration', () => {
    it('uses seeded 3D simplex gradients instead of synchronized Z-slice interpolation', () => {
        expect(COMMON_SHADER_SOURCE).toContain('fn simplexGradient');
        expect(COMMON_SHADER_SOURCE).toContain('fn simplexCorner');
        expect(COMMON_SHADER_SOURCE).toContain('kernel*kernel*kernel*kernel');
        expect(COMMON_SHADER_SOURCE).not.toContain('mix(z0,z1,f.z)');
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
        expect(FIELD_PARAMETER_SCHEMA).toHaveLength(26);
        expect(OCTAVE_PARAMETER_SCHEMA).toHaveLength(7);
        OCTAVE_PARAMETER_SCHEMA.forEach((group) => expect(group).toHaveLength(4));
        expect(OCTAVE_PIXELATE_SCHEMA).toHaveLength(7);
        expect(PARAMETER_SCHEMA).toHaveLength(61);
        expect(new Set(PARAMETER_SCHEMA.map(({ key }) => key)).size).toBe(61);
        for (const parameter of PARAMETER_SCHEMA) {
            expect(parameter.min).toBeLessThan(parameter.max);
            expect(parameter.step).toBeGreaterThan(0);
            expect(parameter.default).toBeGreaterThanOrEqual(parameter.min);
            expect(parameter.default).toBeLessThanOrEqual(parameter.max);
            expect(defaultParameters()[parameter.key]).toBe(parameter.default);
        }
        expect(defaultParameters().centerDarkness).toBe(0);
        expect(defaultParameters()).toMatchObject({
            secondaryEnabled: 1,
            secondaryScale: 1.1,
            secondaryCloudAmount: 0,
            secondaryRibbonAmount: 0,
            secondaryRibbonSharpness: 1.76,
            tertiaryEnabled: 1,
            tertiaryScale: 2.035,
            tertiaryCloudAmount: 0,
            tertiaryRibbonAmount: 0,
            tertiaryRibbonSharpness: 1.76,
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
    it('packs the aligned uniform header and array<vec4f, 7>', () => {
        const parameters = defaultParameters();
        parameters.octave1Pixelate = 1;
        parameters.octave3Pixelate = 1;
        const data = packUniform([320, 180], 2, 9, parameters, 6);
        expect(data).toHaveLength(UNIFORM_FLOATS);
        expect(data.byteLength).toBe(240);
        expect(Array.from(data.slice(11, 21))).toEqual(
            Array.from(new Float32Array([1, 1.1, 0, 0, 1.76, 1, 2.035, 0, 0, 1.76])),
        );
        expect(data[30]).toBe(6);
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
    });
});
