import { describe, expect, it } from 'vitest';
import {
    FIELD_PARAMETER_SCHEMA,
    OCTAVE_COUNT,
    OCTAVE_PARAMETER_SCHEMA,
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
        expect(FIELD_PARAMETER_SCHEMA).toHaveLength(17);
        expect(OCTAVE_PARAMETER_SCHEMA).toHaveLength(7);
        OCTAVE_PARAMETER_SCHEMA.forEach((group) => expect(group).toHaveLength(4));
        expect(PARAMETER_SCHEMA).toHaveLength(45);
        expect(new Set(PARAMETER_SCHEMA.map(({ key }) => key)).size).toBe(45);
        for (const parameter of PARAMETER_SCHEMA) {
            expect(parameter.min).toBeLessThan(parameter.max);
            expect(parameter.step).toBeGreaterThan(0);
            expect(parameter.default).toBeGreaterThanOrEqual(parameter.min);
            expect(parameter.default).toBeLessThanOrEqual(parameter.max);
            expect(defaultParameters()[parameter.key]).toBe(parameter.default);
        }
        expect(defaultParameters().centerDarkness).toBe(0.65);
        expect(OCTAVE_PARAMETER_SCHEMA.map((group) => group[0].default)).toEqual([
            0.12, 0.09, 0.065, 0.045, 0.03, 0.02, 0.012,
        ]);
    });
    it('packs the aligned uniform header and array<vec4f, 7>', () => {
        const parameters = defaultParameters();
        const data = packUniform([320, 180], 2, 9, parameters, 6);
        expect(data).toHaveLength(UNIFORM_FLOATS);
        expect(data.byteLength).toBe(208);
        expect(data[21]).toBe(6);
        expect(Array.from(data.slice(22, 24))).toEqual([0, 0]);
        expect(Array.from(data.slice(24, 28))).toEqual(
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
