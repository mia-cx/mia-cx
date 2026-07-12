import { describe, expect, it } from 'vitest';
import { CursorState, CURSOR_TRAIL_SAMPLES } from './cursor';
import { CURSOR_EFFECT_GROUPS, CURSOR_PARAMETER_KEYS, CURSOR_UNIFORM_PARAMETER_SCHEMA } from './cursor-schema';
import { CURSOR_PARAMETER_OFFSET, packCursorUniform } from './cursor-uniform';

const rect = { left: 10, top: 20, width: 400, height: 200 };
describe('CursorState', () => {
    it('exposes one density pressure group with persistent-field controls', () => {
        const densityGroups = CURSOR_EFFECT_GROUPS.filter(([label]) => label === 'Density pressure');
        expect(densityGroups).toHaveLength(1);
        expect(densityGroups[0][2].map(({ label }) => label)).toEqual([
            'Radius',
            'Falloff',
            'Density strength',
            'Build-up time',
            'Decay',
        ]);
        expect(densityGroups[0][2][3]).toMatchObject({ min: 0, max: 2, default: 0.4 });
        expect(CURSOR_EFFECT_GROUPS.some(([label]) => label.toLowerCase().includes('halogen'))).toBe(false);
        expect(CURSOR_PARAMETER_KEYS.some((key) => key.includes('Halogen'))).toBe(false);
    });
    it('keeps CPU texture controls out of the compact shader parameter ABI', () => {
        expect(CURSOR_UNIFORM_PARAMETER_SCHEMA).toHaveLength(3);
        expect(CURSOR_UNIFORM_PARAMETER_SCHEMA.some(({ key }) => key === 'cursorDensityPressureBuildUp')).toBe(false);
        expect(CURSOR_UNIFORM_PARAMETER_SCHEMA.map(({ key }) => key)).toEqual([
            'cursorEnabled',
            'cursorDensityPressureEnabled',
            'cursorDensityStrength',
        ]);
        const packed = packCursorUniform({ cursorDensityBuildUp: 0.777 }, undefined);
        expect(packed).toHaveLength(4);
        expect(packed[3]).toBe(0);
    });
    it('uses aspect-correct CSS coordinates independent of backing resolution', () => {
        const a = new CursorState().update(310, 120, rect, 10);
        const b = new CursorState().update(310, 120, { ...rect }, 10);
        expect([a.x, a.y]).toEqual([1, 0]);
        expect([b.x, b.y]).toEqual([1, 0]);
        expect(new CursorState().update(210, 20, rect, 10).y).toBe(-1);
        expect(new CursorState().update(210, 220, rect, 10).y).toBe(1);
    });
    it('uses the shader top-left Y axis for pointer velocity', () => {
        const state = new CursorState().update(210, 70, rect, 10).update(210, 170, rect, 30);
        expect(state.velocityY).toBeGreaterThan(0);
        state.update(210, 70, rect, 50);
        expect(state.velocityY).toBeLessThan(0);
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
