import { describe, expect, it } from 'vitest';
import {
    CHANNELS,
    composeAdjustmentLut,
    curveLut,
    identityLevels,
    interpolateNatural,
    levelsValue,
    newCurve,
    newLevels,
    sanitizeAdjustments,
    setLevelsChannelValue,
} from './adjustments';

describe('RGB Paint.NET adjustment semantics', () => {
    it('creates independent identity channels', () => {
        const curve = newCurve(),
            levels = newLevels();
        CHANNELS.forEach((c) => {
            expect(curve.channels[c]).toEqual([
                { x: 0, y: 0 },
                { x: 255, y: 255 },
            ]);
            expect(levels.channels[c]).toEqual(identityLevels());
        });
        expect(curve.channels.r).not.toBe(curve.channels.g);
        expect(levels.channels.r).not.toBe(levels.channels.g);
    });
    it('keeps natural spline and levels byte semantics', () => {
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
        expect(levelsValue({ inputLow: 10, inputHigh: 110, outputLow: 20, outputHigh: 220, gamma: 2 }, 60)).toBe(70);
    });
    it('migrates scalar settings identically to RGB', () => {
        const [curve, levels] = sanitizeAdjustments([
            {
                type: 'curve',
                id: 'c',
                points: [
                    { x: 0, y: 10 },
                    { x: 255, y: 200 },
                ],
            },
            { type: 'levels', id: 'l', inputLow: 10, inputHigh: 200, gamma: 2, outputLow: 5, outputHigh: 240 },
        ]);
        expect(curve.type).toBe('curve');
        expect(levels.type).toBe('levels');
        if (curve.type === 'curve') expect(curve.channels.r).toEqual(curve.channels.g);
        if (levels.type === 'levels') expect(levels.channels.r).toEqual(levels.channels.b);
    });
    it('sanitizes malformed partial channels independently', () => {
        const [a] = sanitizeAdjustments([{ type: 'levels', channels: { r: { gamma: 99 }, g: null } }]);
        expect(a.type).toBe('levels');
        if (a.type === 'levels') {
            expect(a.channels.r.gamma).toBe(10);
            expect(a.channels.g).toEqual(identityLevels());
            expect(a.channels.b).toEqual(identityLevels());
        }
    });
    it('composes channels independently into interleaved RGBA with quantization', () => {
        const curve = newCurve();
        curve.channels.r = [
            { x: 0, y: 0 },
            { x: 255, y: 128 },
        ];
        curve.channels.b = [
            { x: 0, y: 255 },
            { x: 255, y: 0 },
        ];
        const levels = newLevels();
        levels.channels.r.gamma = 2;
        const lut = composeAdjustmentLut([curve, levels]),
            i = 200 * 4;
        expect(lut).toHaveLength(1024);
        expect([...lut.slice(i, i + 4)]).toEqual([
            Math.trunc(255 * (Math.trunc((200 * 128) / 255) / 255) ** 2),
            200,
            55,
            255,
        ]);
    });
    it('returns RGBA identity when all disabled', () => {
        const a = newCurve();
        a.enabled = false;
        const lut = composeAdjustmentLut([a]);
        expect([...lut.slice(200 * 4, 200 * 4 + 4)]).toEqual([200, 200, 200, 255]);
    });
    it('pushes endpoints only in the edited channel and deep-copies that path', () => {
        const a = newLevels();
        a.channels.r.inputHigh = 20;
        const b = setLevelsChannelValue(a, 'r', 'inputLow', 30);
        expect(b.channels.r).toMatchObject({ inputLow: 30, inputHigh: 31 });
        expect(b.channels.g).toEqual(identityLevels());
        expect(b.channels.g).toBe(a.channels.g);
        expect(b.channels.r).not.toBe(a.channels.r);
    });
});
