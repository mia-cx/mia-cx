import { describe, expect, it } from 'vitest';
import {
    MAX_ADJUSTMENTS,
    composeAdjustmentLut,
    curveLut,
    interpolateNatural,
    levelsValue,
    newLevels,
    sanitizeAdjustments,
    setLevelsValue,
    type CurveAdjustment,
} from './adjustments';

describe('Paint.NET adjustment semantics', () => {
    it('makes an exact identity natural spline LUT', () => {
        expect([
            ...curveLut([
                { x: 0, y: 0 },
                { x: 255, y: 255 },
            ]),
        ]).toEqual(Array.from({ length: 256 }, (_, i) => i));
        expect(
            interpolateNatural(
                [
                    { x: 0, y: 0 },
                    { x: 128, y: 255 },
                    { x: 255, y: 0 },
                ],
                64,
            ),
        ).toBeCloseTo(175.688976, 5);
    });
    it('clamps spline overshoot then truncates', () => {
        const lut = curveLut([
            { x: 0, y: 0 },
            { x: 64, y: 255 },
            { x: 128, y: 0 },
            { x: 255, y: 255 },
        ]);
        expect(lut[60]).toBe(255);
        expect(Number.isInteger(lut[100])).toBe(true);
    });
    it('uses strict boundaries, direct gamma and truncation', () => {
        const a = { ...newLevels(), inputLow: 10, inputHigh: 110, outputLow: 20, outputHigh: 220, gamma: 2 };
        expect(levelsValue(a, 9)).toBe(20);
        expect(levelsValue(a, 10)).toBe(20);
        expect(levelsValue(a, 60)).toBe(70);
        expect(levelsValue(a, 109)).toBe(216);
        expect(levelsValue(a, 110)).toBe(220);
    });
    it('lets the edited levels endpoint win and push its partner', () => {
        expect(setLevelsValue({ ...newLevels(), inputHigh: 20 }, 'inputLow', 30)).toMatchObject({
            inputLow: 30,
            inputHigh: 31,
        });
        expect(setLevelsValue({ ...newLevels(), outputLow: 30 }, 'outputHigh', 20)).toMatchObject({
            outputLow: 19,
            outputHigh: 20,
        });
    });
    it('composes enabled byte LUTs in order with intermediate quantization', () => {
        const curve: CurveAdjustment = {
            id: 'c',
            type: 'curve',
            enabled: true,
            points: [
                { x: 0, y: 0 },
                { x: 255, y: 128 },
            ],
        };
        const levels = { ...newLevels(), id: 'l', gamma: 2 };
        const result = composeAdjustmentLut([curve, levels]);
        expect(result[200]).toBe(Math.trunc(255 * (Math.trunc((200 * 128) / 255) / 255) ** 2));
        expect(composeAdjustmentLut([{ ...curve, enabled: false }])[200]).toBe(200);
    });
    it('sanitizes malformed state, IDs, integer points, endpoints, separation and count', () => {
        const raw = Array.from({ length: MAX_ADJUSTMENTS + 3 }, (_, i) =>
            i === 0
                ? {
                      type: 'curve',
                      id: 'same',
                      points: [
                          { x: 4.4, y: 8.7 },
                          { x: 4.2, y: 99 },
                      ],
                  }
                : { type: 'levels', id: 'same', inputLow: 255, inputHigh: 0, outputLow: 255, outputHigh: 0, gamma: 99 },
        );
        const out = sanitizeAdjustments(raw);
        expect(out).toHaveLength(MAX_ADJUSTMENTS);
        expect(new Set(out.map((a) => a.id)).size).toBe(MAX_ADJUSTMENTS);
        expect(out[0]).toMatchObject({
            type: 'curve',
            points: [
                { x: 0, y: 0 },
                { x: 4, y: 99 },
                { x: 255, y: 255 },
            ],
        });
        const level = out[1];
        expect(level.type).toBe('levels');
        if (level.type === 'levels') {
            expect(level.inputLow).toBeLessThan(level.inputHigh);
            expect(level.outputLow).toBeLessThan(level.outputHigh);
            expect(level.gamma).toBe(10);
        }
    });
});
