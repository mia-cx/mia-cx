import { describe, expect, it } from 'vitest';
import { CursorState, CURSOR_TRAIL_SAMPLES } from './cursor';

const rect = { left: 10, top: 20, width: 400, height: 200 };
describe('CursorState', () => {
    it('uses aspect-correct CSS coordinates independent of backing resolution', () => {
        const a = new CursorState().update(310, 120, rect, 10);
        const b = new CursorState().update(310, 120, { ...rect }, 10);
        expect([a.x, a.y]).toEqual([1, 0]);
        expect([b.x, b.y]).toEqual([1, 0]);
    });
    it('keeps a fixed trail and ages samples only when ticked', () => {
        const state = new CursorState();
        for (let i = 0; i < 30; i++) state.update(10 + i * 10, 120, rect, 10 + i * 10);
        expect(state.trail).toHaveLength(CURSOR_TRAIL_SAMPLES);
        expect(state.trailCount).toBe(CURSOR_TRAIL_SAMPLES);
        const age = state.trail[0].age;
        state.tick(0.25);
        expect(state.trail[0].age).toBeCloseTo(age + 0.25);
    });
    it('smooths movement energy and alternates click polarity', () => {
        const state = new CursorState().update(100, 100, rect, 10).update(300, 100, rect, 30);
        expect(state.movingEnergy).toBeGreaterThan(0);
        state.pointerDown();
        const first = state.clickPolarity;
        state.pointerUp().pointerDown();
        expect(state.clickPolarity).toBe(-first);
        expect(state.clickAge).toBe(0);
        const energy = state.movingEnergy;
        state.tick(1);
        expect(state.movingEnergy).toBeLessThan(energy);
    });
});
