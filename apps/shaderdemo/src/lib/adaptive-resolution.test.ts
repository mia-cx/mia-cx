import { describe, expect, it } from 'vitest';
import { AdaptiveResolutionController } from './adaptive-resolution';

const controller = () =>
    new AdaptiveResolutionController(1, {
        warmupMs: 0,
        downSustainMs: 100,
        upSustainMs: 300,
        downCooldownMs: 200,
        upCooldownMs: 400,
    });

function feed(c: AdaptiveResolutionController, frameMs: number, from: number, duration: number) {
    let changed: number | undefined;
    for (let now = from; now <= from + duration; now += frameMs) changed = c.sample(frameMs, now) ?? changed;
    return changed;
}

describe('adaptive resolution', () => {
    it('drops quickly under sustained load and rises conservatively with headroom', () => {
        const c = controller();
        expect(feed(c, 20, 0, 100)).toBe(0.95);
        expect(feed(c, 12, 500, 300)).toBe(1);
    });

    it('uses hysteresis and ignores alternating/target-budget frames', () => {
        const c = controller();
        for (let now = 0; now < 1_000; now += 16) expect(c.sample(now % 32 ? 19 : 13, now)).toBeUndefined();
        expect(c.effectiveScale).toBe(1);
    });

    it('honours cooldowns, floor, and the user ceiling', () => {
        const c = controller();
        expect(feed(c, 20, 0, 100)).toBe(0.95);
        expect(feed(c, 20, 120, 100)).toBeUndefined();
        for (let start = 400; start < 4_000; start += 300) feed(c, 20, start, 120);
        expect(c.effectiveScale).toBeGreaterThanOrEqual(0.25);
        expect(c.setCeiling(0.4, 5_000)).toBeLessThanOrEqual(0.4);
    });

    it('resets evidence while paused and during warmup', () => {
        const c = controller();
        feed(c, 20, 0, 60);
        c.sample(20, 100, false);
        expect(feed(c, 20, 120, 60)).toBeUndefined();
        const warming = new AdaptiveResolutionController(1, { warmupMs: 200, downSustainMs: 100 });
        warming.reset(500);
        expect(feed(warming, 20, 500, 100)).toBeUndefined();
    });
});
