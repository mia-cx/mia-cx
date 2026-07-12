import { describe, expect, it } from 'vitest';
import { AdaptiveResolutionController } from './adaptive-resolution';

const gpuWindow = (controller: AdaptiveResolutionController, ms: number) => {
    const count = controller.currentEvaluationWindow;
    let changed: number | undefined;
    for (let sample = 0; sample < count; sample += 1)
        changed = controller.sampleGpu(ms, sample, true, controller.effectiveScale) ?? changed;
    return changed;
};

describe('GPU-processing-only adaptive resolution', () => {
    it('advances after exactly 1, 2, 4, ... 512 GPU samples and continues at 512', () => {
        const controller = new AdaptiveResolutionController(1);
        for (const window of [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 512]) {
            expect(controller.currentEvaluationWindow).toBe(window);
            for (let sample = 1; sample < window; sample += 1) {
                controller.sampleGpu(14.5);
                expect(controller.currentEvaluationWindow).toBe(window);
            }
            controller.sampleGpu(14.5);
        }
        controller.reset();
        expect(controller.currentEvaluationWindow).toBe(1);
    });

    it('never lets rAF/vsync samples advance the schedule or change scale', () => {
        const controller = new AdaptiveResolutionController(1);
        for (let frame = 0; frame < 2_000; frame += 1) controller.sample(frame % 2 ? 8 : 40, frame);
        expect(controller.currentEvaluationWindow).toBe(1);
        expect(controller.effectiveScale).toBe(1);
    });

    it('uses the first GPU result for an immediate predictive estimate', () => {
        const controller = new AdaptiveResolutionController(1);
        expect(controller.sampleGpu(30)).toBe(0.7);
        expect(controller.currentEvaluationWindow).toBe(2);
    });

    it('uses nearest-rank p99 so a single outlier lowers scale', () => {
        const controller = new AdaptiveResolutionController(1);
        controller.sampleGpu(14.5); // first window, no movement
        controller.sampleGpu(5);
        expect(controller.sampleGpu(40)).toBeLessThan(1);
    });

    it('lowers under sustained load and raises back to the user ceiling with headroom', () => {
        const controller = new AdaptiveResolutionController(1);
        for (let i = 0; i < 8; i += 1) gpuWindow(controller, 30);
        expect(controller.effectiveScale).toBeLessThan(1);
        for (let i = 0; i < 12 && controller.effectiveScale < 1; i += 1) gpuWindow(controller, 6);
        expect(controller.effectiveScale).toBe(1);
    });

    it('recovers across a low-power to charger performance transition', () => {
        const controller = new AdaptiveResolutionController(1);
        for (let i = 0; i < 6; i += 1) gpuWindow(controller, 24);
        const lowPowerScale = controller.effectiveScale;
        expect(lowPowerScale).toBeLessThan(1);
        for (let i = 0; i < 12 && controller.effectiveScale < 1; i += 1) gpuWindow(controller, 7);
        expect(controller.effectiveScale).toBeGreaterThan(lowPowerScale);
        expect(controller.effectiveScale).toBe(1);
    });

    it('has a global 0.125 minimum and resets safely on lifecycle and ceiling changes', () => {
        const controller = new AdaptiveResolutionController(1);
        for (let i = 0; i < 20; i += 1) gpuWindow(controller, 1_000);
        expect(controller.minScale).toBe(0.125);
        expect(controller.effectiveScale).toBe(0.125);
        controller.reset();
        expect(controller.currentEvaluationWindow).toBe(1);
        expect(controller.setCeiling(0.4)).toBeLessThanOrEqual(0.4);
        expect(controller.currentEvaluationWindow).toBe(1);
        controller.sampleGpu(30, 0, false);
        expect(controller.currentEvaluationWindow).toBe(1);
    });
});
