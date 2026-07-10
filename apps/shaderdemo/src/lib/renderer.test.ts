import { describe, expect, it } from 'vitest';
import { STAGES, defaultStages, renderSize, scaledSize } from './renderer';

describe('recursive field configuration', () => {
    it('exposes only the base, three octaves, and animation', () => {
        expect(STAGES).toEqual(['base', 'octave1', 'octave2', 'octave3', 'animation']);
        expect(defaultStages()).toEqual({ base: true, octave1: true, octave2: true, octave3: true, animation: true });
    });
    it('caps DPR and rounds down to stable physical dimensions', () => {
        expect(renderSize(801.9, 600.8, 3, 1.5)).toEqual({ width: 1202, height: 901 });
        expect(renderSize(0, 0, 2, 1)).toEqual({ width: 1, height: 1 });
    });
    it('keeps low-resolution render targets valid', () => {
        expect(scaledSize(1202, 901, 0.18)).toEqual({ width: 216, height: 162 });
        expect(scaledSize(0, 0, 0.18)).toEqual({ width: 1, height: 1 });
    });
});
