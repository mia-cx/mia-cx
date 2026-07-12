import { describe, expect, it } from 'vitest';
import { AdaptiveResolutionController } from './adaptive-resolution';

const renderWindow = (controller: AdaptiveResolutionController, ms: number, gpuMs?: number) => {
    const count = controller.currentEvaluationWindow;
    let changed: number | undefined;
    for (let frame = 0; frame < count; frame += 1) changed = controller.sample(ms, frame, true, gpuMs) ?? changed;
    return changed;
};

describe('progressive predictive adaptive resolution', () => {
    it('evaluates after exactly 1, 2, 4, ... 512 consecutive frames and then stays at 512', () => {
        const controller = new AdaptiveResolutionController(1);
        const schedule = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 512];
        for (const window of schedule) {
            expect(controller.currentEvaluationWindow).toBe(window);
            for (let frame = 1; frame < window; frame += 1) {
                expect(controller.sample(16.67, frame)).toBeUndefined();
                expect(controller.currentEvaluationWindow).toBe(window);
            }
            expect(controller.sample(16.67, window)).toBeUndefined();
        }
    });

    it('uses the first valid rendered frame for an immediate estimate', () => {
        const controller = new AdaptiveResolutionController(1);
        expect(controller.sample(30, 0)).toBe(0.7);
        expect(controller.currentEvaluationWindow).toBe(2);
    });

    it('uses nearest-rank p99, retaining one slow frame in a small window', () => {
        const controller = new AdaptiveResolutionController(1);
        renderWindow(controller, 16.67); // advance to two frames
        expect(controller.sample(16.67, 1)).toBeUndefined();
        expect(controller.sample(40, 2)).toBeLessThan(1);
    });

    it('targets a sub-refresh budget with safety headroom', () => {
        const controller = new AdaptiveResolutionController(1, { targetMs: 15.5 });
        const changed = controller.sample(20, 0);
        expect(changed).toBeDefined();
        expect(changed!).toBeLessThan(0.9);
    });

    it('does not downscale forever when rAF is locked to 60 Hz', () => {
        const controller = new AdaptiveResolutionController(1);
        for (let frame = 0; frame < 1_200; frame += 1) controller.sample(16.67, frame);
        expect(controller.effectiveScale).toBe(1);
    });

    it('uses corrected GPU timing to upscale when vsync conceals headroom', () => {
        const controller = new AdaptiveResolutionController(1);
        controller.sample(30, 0);
        const reduced = controller.effectiveScale;
        controller.sampleGpu(8, 1);
        expect(controller.sample(16.67, 2)).toBeUndefined();
        expect(controller.sample(16.67, 3)).toBeGreaterThan(reduced);
    });

    it('honours scale bounds and restarts at one frame on reset and ceiling changes', () => {
        const controller = new AdaptiveResolutionController(1);
        controller.sample(1_000, 0);
        expect(controller.effectiveScale).toBeGreaterThanOrEqual(0.25);
        expect(controller.currentEvaluationWindow).toBe(2);
        controller.reset(1);
        expect(controller.currentEvaluationWindow).toBe(1);
        expect(controller.setCeiling(0.4, 2)).toBeLessThanOrEqual(0.4);
        expect(controller.currentEvaluationWindow).toBe(1);
        controller.sample(30, 3, false);
        expect(controller.currentEvaluationWindow).toBe(1);
    });
});
