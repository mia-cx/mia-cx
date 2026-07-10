import { describe, expect, it } from 'vitest';
import { PARAMETER_SCHEMA, advanceSimulationTime, defaultParameters, renderSize, scaledSize } from './renderer';

describe('field configuration', () => {
    it('caps DPR and rounds down to stable physical dimensions', () => {
        expect(renderSize(801.9, 600.8, 3, 1.5)).toEqual({ width: 1202, height: 901 });
        expect(renderSize(0, 0, 2, 1)).toEqual({ width: 1, height: 1 });
    });
    it('keeps low-resolution render targets valid', () => {
        expect(scaledSize(1202, 901, 0.18)).toEqual({ width: 216, height: 162 });
        expect(scaledSize(0, 0, 0.18)).toEqual({ width: 1, height: 1 });
    });
    it('changes evolution rate without changing the current phase', () => {
        expect(advanceSimulationTime(12, 0, 3)).toBe(12);
        expect(advanceSimulationTime(12, 0.5, 1)).toBe(12.5);
        expect(advanceSimulationTime(12, 0.5, 3)).toBe(13.5);
    });
    it('defines complete, valid slider defaults from one schema', () => {
        expect(PARAMETER_SCHEMA).toHaveLength(17);
        expect(new Set(PARAMETER_SCHEMA.map(({ key }) => key)).size).toBe(PARAMETER_SCHEMA.length);
        for (const parameter of PARAMETER_SCHEMA) {
            expect(parameter.min).toBeLessThan(parameter.max);
            expect(parameter.step).toBeGreaterThan(0);
            expect(parameter.default).toBeGreaterThanOrEqual(parameter.min);
            expect(parameter.default).toBeLessThanOrEqual(parameter.max);
            expect(defaultParameters()[parameter.key]).toBe(parameter.default);
        }
        expect(defaultParameters()).toMatchObject({
            centerDarkness: 1,
            centerWidth: 0.83,
            centerHeight: 0.83,
            centerRoundness: 4,
            centerSoftness: 1.5,
        });
    });
});
