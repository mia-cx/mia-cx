import { describe, expect, it } from 'vitest';
import { STAGES, defaultStages, renderSize } from './renderer';

describe('renderer configuration', () => {
    it('enables every compositing stage by default', () => {
        const stages = defaultStages();
        expect(STAGES).toHaveLength(10);
        expect(Object.values(stages).every(Boolean)).toBe(true);
    });
    it('caps DPR and rounds down to stable physical dimensions', () => {
        expect(renderSize(801.9, 600.8, 3, 1.5)).toEqual({ width: 1202, height: 901 });
        expect(renderSize(0, 0, 2, 1)).toEqual({ width: 1, height: 1 });
    });
});
