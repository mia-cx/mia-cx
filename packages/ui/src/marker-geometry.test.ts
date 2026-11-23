import { describe, expect, it } from 'vitest';
import { mergeLines, shrinkTarget, wipeOrder } from './marker-geometry';

const box = (l: number, r: number, t: number, b: number) => ({ l, r, t, b });

describe('mergeLines', () => {
    it('joins the pieces of a line and orders lines top to bottom', () => {
        const lines = mergeLines([
            { rect: box(100, 140, 30, 50), item: 'second line' },
            { rect: box(10, 60, 0, 20), item: 'link' },
            { rect: box(60, 200, 1, 21), item: 'rest of the first line' },
        ]);
        expect(lines).toEqual([
            { ...box(10, 200, 0, 21), item: 'link' },
            { ...box(100, 140, 30, 50), item: 'second line' },
        ]);
    });
});

describe('shrinkTarget', () => {
    const line = box(100, 300, 40, 60);
    it.each([
        ['into its start when the point is above it', { x: 500, y: 0 }, 100],
        ['into its end when the point is below it', { x: 0, y: 200 }, 300],
        ['to the point when the point is level with it', { x: 180, y: 50 }, 180],
        ['to its nearest end when a level point is past it', { x: 900, y: 50 }, 300],
        ['into its middle with no point', undefined, 200],
    ])('shrinks %s', (_, point, x) => {
        expect(shrinkTarget(line, point)).toBe(x);
    });
});

describe('wipeOrder', () => {
    it('clears the line farthest from the point first', () => {
        const lines = [box(0, 1, 0, 10), box(0, 1, 20, 30), box(0, 1, 40, 50)];
        expect(wipeOrder(lines, { x: 0, y: 100 })).toEqual([lines[0], lines[1], lines[2]]);
        expect(wipeOrder(lines, { x: 0, y: -100 })).toEqual([lines[2], lines[1], lines[0]]);
    });
});
