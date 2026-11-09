import { describe, expect, it } from 'vitest';
import { atmoPerfEnabled, parseAtmoScale } from './perf-params';
import { AdaptiveResolutionController } from './adaptive-resolution';
import { pinnedRenderScale } from './renderer';

describe('atmo URL parameters', () => {
    it('detects the perf flag only when present', () => {
        expect(atmoPerfEnabled('?atmo-perf')).toBe(true);
        expect(atmoPerfEnabled('?atmo-perf=0')).toBe(true);
        expect(atmoPerfEnabled('?atmo-scale=1')).toBe(false);
        expect(atmoPerfEnabled('')).toBe(false);
    });

    it('parses and clamps the scale pin', () => {
        expect(parseAtmoScale('?atmo-scale=0.5')).toBe(0.5);
        expect(parseAtmoScale('?atmo-scale=4')).toBe(1);
        expect(parseAtmoScale('?atmo-scale=0.01')).toBe(0.125);
        expect(parseAtmoScale('?atmo-scale=oops')).toBe(undefined);
        expect(parseAtmoScale('?atmo-perf')).toBe(undefined);
        expect(parseAtmoScale('')).toBe(undefined);
    });

    it('agrees with the renderer-side clamp', () => {
        const options = { pinnedScale: parseAtmoScale('?atmo-scale=0.4') };
        expect(pinnedRenderScale(options)).toBe(0.4);
        expect(pinnedRenderScale({ pinnedScale: 9 })).toBe(1);
        expect(pinnedRenderScale({})).toBe(undefined);
    });
});

describe('pinned adaptive scale', () => {
    const pinned = (value: number) => new AdaptiveResolutionController(value, { initialScale: value, minScale: value });

    it('holds the scale under over- and under-budget GPU samples', () => {
        const controller = pinned(0.4);
        for (let i = 0; i < 600; i++) controller.sampleGpu(80, i * 16, true, 0.4);
        expect(controller.effectiveScale).toBe(0.4);
        for (let i = 0; i < 600; i++) controller.sampleGpu(0.5, 10_000 + i * 16, true, 0.4);
        expect(controller.effectiveScale).toBe(0.4);
    });

    it('stays pinned through setCeiling and reset', () => {
        const controller = pinned(0.3);
        controller.setCeiling(0.3);
        controller.reset();
        for (let i = 0; i < 600; i++) controller.sampleGpu(100, i * 16, true, 0.3);
        expect(controller.effectiveScale).toBe(0.3);
    });
});
