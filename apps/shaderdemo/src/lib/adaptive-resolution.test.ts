import { describe, expect, it } from 'vitest';
import { AdaptiveResolutionController, type AdaptiveResolutionOptions } from './adaptive-resolution';

const controller = (extra: AdaptiveResolutionOptions = {}) =>
    new AdaptiveResolutionController(1, { warmupMs: 0, trialWarmupMs: 0, downSustainMs: 0, ...extra });

describe('predictive adaptive resolution', () => {
    it('makes a substantial model-based jump on first overload', () => {
        expect(controller().sample(30, 0)).toBe(0.675);
    });

    it('uses its candidate measurement to refine toward the budget', () => {
        const c = controller();
        expect(c.sampleGpu(30, 0)).toBe(0.675);
        expect(c.sampleGpu(18, 500)).toBe(0.55);
    });

    it('fits fixed plus quadratic pixel cost from two scales', () => {
        const c = controller();
        c.sampleGpu(24, 0); // actual workload is 4 + 20 * scale²
        const trial = c.effectiveScale;
        const result = c.sampleGpu(4 + 20 * trial * trial, 500);
        expect(result).toBeCloseTo(Math.round(Math.sqrt(10.75 / 20) / 0.025) * 0.025);
    });

    it('honours floor and ceiling', () => {
        const c = controller();
        c.sample(200, 0);
        expect(c.effectiveScale).toBeGreaterThanOrEqual(0.25);
        expect(c.setCeiling(0.4, 10)).toBeLessThanOrEqual(0.4);
    });

    it('settles without oscillating inside hysteresis', () => {
        const c = controller();
        for (let now = 0; now < 1_000; now += 17) expect(c.sample(16.67, now)).toBeUndefined();
        expect(c.effectiveScale).toBe(1);
    });

    it('uses GPU timing to see headroom hidden by 60 Hz vsync', () => {
        const c = controller({ upSustainMs: 400 });
        c.sampleGpu(30, 0);
        const reduced = c.effectiveScale;
        expect(c.sample(16.67, 100)).toBeUndefined();
        expect(c.sampleGpu(8, 500)).toBeGreaterThan(reduced);
    });

    it('resets evidence while inactive and during warmup', () => {
        const c = controller({ downSustainMs: 100 });
        c.sample(30, 0);
        c.sample(30, 50, false);
        expect(c.sample(30, 60)).toBeUndefined();
        const warming = new AdaptiveResolutionController(1, { warmupMs: 200, downSustainMs: 0 });
        warming.reset(500);
        expect(warming.sample(30, 600)).toBeUndefined();
    });
});
