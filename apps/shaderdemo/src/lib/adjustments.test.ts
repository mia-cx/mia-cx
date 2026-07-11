import { describe, expect, it } from 'vitest';
import {
    CHANNELS,
    applyHslAdjustment,
    applyCurveEdit,
    applyCurveEditToChannels,
    composeAdjustmentLut,
    curveLut,
    hslToRgb,
    identityLevels,
    interpolateNatural,
    levelsValue,
    newCurve,
    newHslCurve,
    newHslAdjustment,
    newLevels,
    rgbToHsl,
    sanitizeAdjustments,
    setCurveMode,
    setLevelsChannelValue,
    setLevelsChannelsValue,
    toggleChannelMask,
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
        if (curve.type === 'curve' && curve.mode === 'rgb') expect(curve.channels.r).toEqual(curve.channels.g);
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
    it('applies curve operations to selected channels while preserving unrelated points', () => {
        const a = newCurve();
        a.channels.r.splice(1, 0, { x: 40, y: 50 });
        a.channels.g.splice(1, 0, { x: 80, y: 90 });
        const added = applyCurveEditToChannels(a, ['r', 'g'], { type: 'add', x: 100, y: 110 });
        expect(added.channels.r).toContainEqual({ x: 40, y: 50 });
        expect(added.channels.g).toContainEqual({ x: 80, y: 90 });
        expect(added.channels.b).toBe(a.channels.b);
        const moved = applyCurveEditToChannels(added, ['r', 'g'], { type: 'move', oldX: 100, x: 120, y: 130 });
        expect(moved.channels.r).toContainEqual({ x: 120, y: 130 });
        expect(moved.channels.g).toContainEqual({ x: 120, y: 130 });
        const removed = applyCurveEditToChannels(moved, ['r'], { type: 'remove', x: 120 });
        expect(removed.channels.r.some((point) => point.x === 120)).toBe(false);
        expect(removed.channels.g).toBe(moved.channels.g);
    });
    it('locks endpoint x during curve movement', () => {
        expect(applyCurveEdit(newCurve().channels.r, { type: 'move', oldX: 0, x: 90, y: 25 })[0]).toEqual({
            x: 0,
            y: 25,
        });
        expect(applyCurveEdit(newCurve().channels.r, { type: 'remove', x: 255 })).toHaveLength(2);
    });
    it('applies levels constraints independently to selected channels only', () => {
        const a = newLevels();
        a.channels.r.inputHigh = 20;
        a.channels.g.inputHigh = 40;
        a.channels.g.gamma = 2;
        const b = setLevelsChannelsValue(a, ['r', 'g'], 'inputLow', 30);
        expect(b.channels.r).toMatchObject({ inputLow: 30, inputHigh: 31 });
        expect(b.channels.g).toMatchObject({ inputLow: 30, inputHigh: 40, gamma: 2 });
        expect(b.channels.b).toBe(a.channels.b);
    });
    it('allows every channel in the mask to be unchecked', () => {
        expect(toggleChannelMask(['r'], 'r')).toEqual([]);
        expect(toggleChannelMask(['r', 'b'], 'r')).toEqual(['b']);
        expect(toggleChannelMask(['b'], 'g')).toEqual(['g', 'b']);
        expect(CHANNELS.reduce((mask, channel) => toggleChannelMask(mask, channel), [...CHANNELS])).toEqual([]);
    });
    it('preserves adjustment identity when editing an empty channel mask', () => {
        const curve = newCurve();
        const levels = newLevels();
        expect(applyCurveEditToChannels(curve, [], { type: 'add', x: 100, y: 110 })).toBe(curve);
        expect(setLevelsChannelsValue(levels, [], 'gamma', 2)).toBe(levels);
    });
    it('converts known RGB primaries and grayscale through standard HSL', () => {
        expect(rgbToHsl(1, 0, 0)).toEqual({ h: 0, s: 1, l: 0.5 });
        expect(rgbToHsl(0, 1, 0)).toMatchObject({ s: 1, l: 0.5 });
        expect(rgbToHsl(0, 1, 0).h).toBeCloseTo(1 / 3);
        expect(rgbToHsl(0, 0, 1)).toMatchObject({ s: 1, l: 0.5 });
        expect(rgbToHsl(0, 0, 1).h).toBeCloseTo(2 / 3);
        expect(rgbToHsl(0.4, 0.4, 0.4)).toEqual({ h: 0, s: 0, l: 0.4 });
        expect(hslToRgb(0, 1, 0.5)).toEqual([1, 0, 0]);
        const green = hslToRgb(1 / 3, 1, 0.5);
        const blue = hslToRgb(2 / 3, 1, 0.5);
        green.forEach((value, index) => expect(value).toBeCloseTo([0, 1, 0][index]));
        blue.forEach((value, index) => expect(value).toBeCloseTo([0, 0, 1][index]));
    });
    it('keeps every grayscale byte exact through an identity HSL curve', () => {
        const lut = composeAdjustmentLut([newHslCurve()]);
        for (let value = 0; value < 256; value++) {
            expect([...lut.slice(value * 4, value * 4 + 4)]).toEqual([value, value, value, 255]);
        }
    });
    it('interleaves RGB and HSL curves in literal stack order', () => {
        const rgb = newCurve();
        rgb.channels.g = [
            { x: 0, y: 0 },
            { x: 255, y: 0 },
        ];
        rgb.channels.b = [
            { x: 0, y: 0 },
            { x: 255, y: 0 },
        ];
        const hsl = newHslCurve();
        hsl.channels.h = [
            { x: 0, y: 85 },
            { x: 255, y: 85 },
        ];
        const forward = composeAdjustmentLut([rgb, hsl]);
        const reverse = composeAdjustmentLut([hsl, rgb]);
        expect([...forward.slice(128 * 4, 128 * 4 + 4)]).toEqual([0, 128, 0, 255]);
        expect([...reverse.slice(128 * 4, 128 * 4 + 4)]).toEqual([128, 0, 0, 255]);
    });
    it('migrates legacy curves to RGB and sanitizes HSL channels independently', () => {
        const [legacy, hsl] = sanitizeAdjustments([
            { type: 'curve', points: [{ x: 20, y: 30 }] },
            { type: 'curve', mode: 'hsl', channels: { h: [{ x: 64, y: 128 }], s: null } },
        ]);
        expect(legacy).toMatchObject({ type: 'curve', mode: 'rgb' });
        expect(hsl).toMatchObject({ type: 'curve', mode: 'hsl' });
        if (hsl.type === 'curve' && hsl.mode === 'hsl') {
            expect(hsl.channels.h).toContainEqual({ x: 64, y: 128 });
            expect(hsl.channels.s).toEqual([
                { x: 0, y: 0 },
                { x: 255, y: 255 },
            ]);
        }
    });
    it('converts curve modes positionally with deep-copied points', () => {
        const rgb = newCurve();
        rgb.channels.r.splice(1, 0, { x: 10, y: 20 });
        rgb.channels.g.splice(1, 0, { x: 30, y: 40 });
        rgb.channels.b.splice(1, 0, { x: 50, y: 60 });
        const hsl = setCurveMode(rgb, 'hsl');
        expect(hsl).toMatchObject({ id: rgb.id, enabled: rgb.enabled, mode: 'hsl' });
        expect(hsl.channels.h).toEqual(rgb.channels.r);
        expect(hsl.channels.s).toEqual(rgb.channels.g);
        expect(hsl.channels.l).toEqual(rgb.channels.b);
        expect(hsl.channels.h).not.toBe(rgb.channels.r);
        expect(hsl.channels.h[1]).not.toBe(rgb.channels.r[1]);
        const roundTrip = setCurveMode(hsl, 'rgb');
        expect(roundTrip.channels).toEqual(rgb.channels);
        expect(roundTrip.channels.r).not.toBe(hsl.channels.h);
    });
    it('preserves curve identity when its mode is unchanged', () => {
        const rgb = newCurve();
        const hsl = newHslCurve();
        expect(setCurveMode(rgb, 'rgb')).toBe(rgb);
        expect(setCurveMode(hsl, 'hsl')).toBe(hsl);
    });
    it('implements Paint.NET HSL defaults, identity, hue, saturation and lightness bytes', () => {
        const a = newHslAdjustment();
        expect(a).toMatchObject({ type: 'hsl', enabled: true, hue: 0, saturation: 100, lightness: 0 });
        for (const rgb of [
            [0, 0, 0],
            [1, 127, 255],
            [255, 0, 0],
            [42, 43, 44],
        ] as [number, number, number][])
            expect(applyHslAdjustment(a, rgb)).toEqual(rgb);
        expect(applyHslAdjustment({ ...a, hue: 120 }, [255, 0, 0])).toEqual([0, 255, 0]);
        expect(applyHslAdjustment({ ...a, hue: -120 }, [255, 0, 0])).toEqual([0, 0, 255]);
        const intensity = (7471 * 30 + 38470 * 20 + 19595 * 10) >> 16;
        expect(applyHslAdjustment({ ...a, saturation: 0 }, [10, 20, 30])).toEqual([intensity, intensity, intensity]);
        expect(applyHslAdjustment({ ...a, saturation: 200 }, [200, 100, 100])).toEqual([255, 13, 13]);
        expect(applyHslAdjustment({ ...a, lightness: 100 }, [100, 100, 100])).toEqual([254, 254, 254]);
        expect(applyHslAdjustment({ ...a, lightness: -100 }, [100, 100, 100])).toEqual([0, 0, 0]);
        expect(applyHslAdjustment({ ...a, lightness: 50 }, [100, 100, 100])).toEqual([176, 176, 176]);
    });
    it('sanitizes HSL fields and bypasses disabled stack effects', () => {
        const [a] = sanitizeAdjustments([
            { type: 'hsl', id: 'keep', enabled: false, hue: 999, saturation: -4, lightness: NaN },
        ]);
        expect(a).toMatchObject({ id: 'keep', enabled: false, hue: 180, saturation: 0, lightness: 0 });
        const lut = composeAdjustmentLut([a]);
        expect([...lut.slice(90 * 4, 90 * 4 + 4)]).toEqual([90, 90, 90, 255]);
    });
});
