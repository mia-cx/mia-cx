import { describe, expect, it } from 'vitest';
import { CursorDensityField } from './cursor-density-field';

const maximum = (field: CursorDensityField) => Math.max(...field.snapshot().data);

describe('CursorDensityField', () => {
    it('uses about 128 rows and aspect-correct bounded columns', () => {
        const field = new CursorDensityField();
        field.resize(400, 200);
        expect(field.snapshot()).toMatchObject({ width: 256, height: 128 });
        field.resize(10_000, 100);
        expect(field.snapshot().width).toBe(384);
    });

    it('refreshes with MAX stamps without accumulating', () => {
        const field = new CursorDensityField();
        field.resize(200, 200);
        field.deposit(0, 0, 0.5, 2);
        const first = field.snapshot().data.slice();
        const version = field.version;
        expect(field.deposit(0, 0, 0.5, 2)).toBe(false);
        expect(field.snapshot().data).toEqual(first);
        expect(field.version).toBe(version);
        field.tick(0.25, 2);
        expect(maximum(field)).toBeLessThan(Math.max(...first));
        expect(field.deposit(0, 0, 0.5, 2)).toBe(true);
        expect(maximum(field)).toBe(Math.max(...first));
    });

    it('has radial falloff and no pixels outside the radius', () => {
        const field = new CursorDensityField();
        field.resize(256, 256);
        field.deposit(0, 0, 0.5, 1);
        const { data, width, height } = field.snapshot();
        const at = (x: number, y: number) => data[y * width + x];
        expect(at(width / 2, height / 2)).toBeGreaterThan(at(width / 2 + 20, height / 2));
        expect(at(width / 2 + 40, height / 2)).toBe(0);
    });

    it('maps q.x in height units on wide fields', () => {
        const field = new CursorDensityField();
        field.resize(400, 200);
        field.deposit(1, 0, 0.1, 1);
        const { data, width, height } = field.snapshot();
        const strongest = data.indexOf(maximum(field));
        expect(strongest % width).toBeCloseTo(width * 0.75, -1);
        expect(Math.floor(strongest / width)).toBeCloseTo(height / 2, -1);
    });

    it('decays monotonically and becomes an idle no-op', () => {
        const field = new CursorDensityField();
        field.resize(200, 200);
        expect(field.tick(1, 2)).toEqual({ changed: false, active: false });
        field.deposit(0, 0, 0.3, 2);
        let prior = field.snapshot().data.slice();
        for (let index = 0; index < 20; index++) {
            field.tick(0.5, 4);
            const next = field.snapshot().data.slice();
            expect(next.every((value, i) => value <= prior[i])).toBe(true);
            prior = next;
        }
        expect(field.tick(1, 2)).toEqual({ changed: false, active: false });
    });

    it('clears and versions the field on a real resize only', () => {
        const field = new CursorDensityField();
        field.resize(200, 200);
        field.deposit(0, 0, 0.4, 1);
        const version = field.version;
        expect(field.resize(200, 200)).toBe(false);
        expect(field.version).toBe(version);
        expect(field.resize(400, 200)).toBe(true);
        expect(field.snapshot().data.every((value) => value === 0)).toBe(true);
        expect(field.version).toBe(version + 1);
    });

    it('rasterizes sparse samples continuously along a smooth bend', () => {
        const field = new CursorDensityField();
        field.resize(256, 256);
        field.addStrokePoint(-0.8, 0.5, 0.06, 1);
        field.addStrokePoint(0, -0.6, 0.06, 1);
        field.addStrokePoint(0.8, 0.5, 0.06, 1);
        field.endStroke(true, 0.06, 1);
        const { data, width, height } = field.snapshot();
        const atQ = (x: number, y: number) =>
            data[Math.floor(((y + 1) / 2) * height) * width + Math.floor(((x + 1) / 2) * width)];
        expect(atQ(0, -0.325)).toBeGreaterThan(0);
        expect(atQ(0, 0.5)).toBe(0);
        expect(atQ(-0.4, -0.05)).toBeGreaterThan(0);
    });

    it('uses MAX for retracing and separates ended strokes', () => {
        const field = new CursorDensityField();
        field.resize(256, 256);
        for (let pass = 0; pass < 3; pass++) {
            field.addStrokePoint(-0.7, -0.5, 0.1, 1);
            field.addStrokePoint(0.7, -0.5, 0.1, 1);
            field.endStroke(true, 0.1, 1);
        }
        expect(maximum(field)).toBeLessThanOrEqual(255);
        field.addStrokePoint(-0.7, 0.5, 0.1, 1);
        field.endStroke(false);
        const { data, width, height } = field.snapshot();
        expect(data[Math.floor(height / 2) * width + Math.floor(width / 2)]).toBe(0);
    });

    it('discards spline control history on resize', () => {
        const field = new CursorDensityField();
        field.resize(200, 200);
        field.addStrokePoint(-0.8, 0, 0.08, 1);
        field.resize(400, 200);
        field.addStrokePoint(0.8, 0, 0.08, 1);
        field.endStroke(true, 0.08, 1);
        const { data, width, height } = field.snapshot();
        expect(data[Math.floor(height / 2) * width + Math.floor(width / 2)]).toBe(0);
    });
});
