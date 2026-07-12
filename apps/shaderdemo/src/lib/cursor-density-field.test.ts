import { describe, expect, it } from 'vitest';
import { CursorDensityField, MovementEnvelope, densityPressureCoverage } from './cursor-density-field';

const maximum = (field: CursorDensityField) => field.snapshot().data.reduce((a, b) => Math.max(a, b), 0);

describe('CursorDensityField', () => {
    it('uses a finite, strongly monotonic inverse-square radial profile', () => {
        const [center, quarter, half, nearEdge] = [0, 0.25, 0.5, 0.9].map((distance) =>
            densityPressureCoverage(distance, 1),
        );
        expect(Number.isFinite(center)).toBe(true);
        expect(center).toBe(1);
        expect(center).toBeGreaterThan(quarter);
        expect(quarter).toBeGreaterThan(half);
        expect(half).toBeGreaterThan(nearEdge);
        expect(half).toBeCloseTo(0.25, 8);
    });

    it('makes falloff affect the outside much more than the center', () => {
        expect(densityPressureCoverage(0, 8)).toBe(densityPressureCoverage(0, 0));
        expect(densityPressureCoverage(0.75, 8)).toBeLessThan(densityPressureCoverage(0.75, 1) * 0.2);
        expect(densityPressureCoverage(0.5, 0)).toBe(1);
    });

    it('uses only a narrow continuous outer cutoff and is zero at and beyond radius', () => {
        expect(densityPressureCoverage(0.91, 1)).toBeCloseTo(1 / (1 + 12 * 0.91 ** 2), 10);
        expect(densityPressureCoverage(0.999, 1)).toBeGreaterThan(0);
        expect(densityPressureCoverage(0.9999, 1)).toBeLessThan(densityPressureCoverage(0.999, 1));
        expect(densityPressureCoverage(1, 1)).toBe(0);
        expect(densityPressureCoverage(1.1, 1)).toBe(0);
    });

    it('uses about 128 rows and aspect-correct bounded columns', () => {
        const field = new CursorDensityField();
        field.resize(400, 200);
        expect(field.snapshot()).toMatchObject({ width: 1024, height: 512 });
        field.resize(10_000, 100);
        expect(field.snapshot().width).toBe(1024);
    });

    it('repeated stamps use max rather than accumulating', () => {
        const field = new CursorDensityField();
        field.resize(200, 200);
        field.deposit(0, 0, 0.5, 2, 0.08);
        const first = maximum(field);
        expect(first).toBeLessThan(1);
        field.deposit(0, 0, 0.5, 2, 0.08);
        expect(maximum(field)).toBe(first);
        for (let index = 0; index < 100; index++) field.deposit(0, 0, 0.5, 2, 0.08);
        expect(maximum(field)).toBe(first);
    });

    it('commits overlapping curve subsegments once and makes end intensity-neutral', () => {
        const field = new CursorDensityField();
        field.resize(256, 256);
        field.addStrokePoint(-0.01, 0, 0.4, 1, 0.08);
        const first = maximum(field);
        field.addStrokePoint(0.01, 0, 0.4, 1, 0.08);
        const second = maximum(field);
        expect(second - first).toBeLessThanOrEqual(21);
        expect(field.endStroke(true, 0.4, 1)).toBe(false);
        expect(maximum(field)).toBe(second);
    });

    it('has radial falloff and no pixels outside the radius', () => {
        const field = new CursorDensityField();
        field.resize(256, 256);
        field.deposit(0, 0, 0.5, 1);
        const { data, width, height } = field.snapshot();
        const at = (x: number, y: number) => data[y * width + x];
        expect(at(width / 2, height / 2)).toBeGreaterThan(at(width / 2 + 20, height / 2));
        expect(at(width / 2 + 140, height / 2)).toBe(0);
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

    it('has a continuously covered centerline for a long sparse stroke', () => {
        const field = new CursorDensityField();
        field.resize(256, 256);
        field.addStrokePoint(-0.9, 0, 0.3, 4);
        field.addStrokePoint(0.9, 0, 0.3, 4);
        field.endStroke(true, 0.3, 4);
        const { data, width, height } = field.snapshot();
        const row = Math.floor(height / 2);
        const profile = Array.from(data.slice(row * width + 20, row * width + width - 20));
        // Pixel-center sampling and the capsule's rounded ends lower the extremes,
        // but sparse movement must leave no holes or periodic stamp dips.
        expect(Math.min(...profile)).toBeGreaterThan(0.8);
        expect(profile.every((value) => value > 0)).toBe(true);
    });

    it('keeps a sparse curved stroke covered without periodic stamp dips', () => {
        const field = new CursorDensityField();
        field.resize(256, 256);
        field.addStrokePoint(-0.9, 0.6, 0.18, 3);
        field.addStrokePoint(0, -0.8, 0.18, 3);
        field.addStrokePoint(0.9, 0.6, 0.18, 3);
        field.endStroke(true, 0.18, 3);
        const { data, width, height } = field.snapshot();
        // Sample the analytic midpoint quadratics themselves. Every centerline sample
        // should remain near the distance-field maximum, rather than oscillating at stamps.
        const values: number[] = [];
        const sample = (ax: number, ay: number, cx: number, cy: number, bx: number, by: number) => {
            for (let index = 0; index <= 80; index++) {
                const t = index / 80;
                const u = 1 - t;
                const x = u * u * ax + 2 * u * t * cx + t * t * bx;
                const y = u * u * ay + 2 * u * t * cy + t * t * by;
                const px = Math.max(0, Math.min(width - 1, Math.floor(((x + 1) / 2) * width)));
                const py = Math.max(0, Math.min(height - 1, Math.floor(((y + 1) / 2) * height)));
                values.push(data[py * width + px]);
            }
        };
        sample(-0.9, 0.6, -0.9, 0.6, -0.45, -0.1);
        sample(-0.45, -0.1, 0, -0.8, 0.45, -0.1);
        sample(0.45, -0.1, 0.9, 0.6, 0.9, 0.6);
        expect(Math.min(...values)).toBeGreaterThan(0.78);
    });

    it('uses MAX for retracing and separates ended strokes', () => {
        const field = new CursorDensityField();
        field.resize(256, 256);
        for (let pass = 0; pass < 3; pass++) {
            field.addStrokePoint(-0.7, -0.5, 0.1, 1);
            field.addStrokePoint(0.7, -0.5, 0.1, 1);
            field.endStroke(true, 0.1, 1);
        }
        expect(maximum(field)).toBeLessThanOrEqual(1);
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

    it('uses elapsed movement time rather than event frequency', () => {
        const lowRate = new MovementEnvelope();
        const highRate = new MovementEnvelope();
        let a = 0,
            b = 0;
        for (let t = 0; t <= 400; t += 100) a = lowRate.strength(t, 0.4);
        for (let t = 0; t <= 400; t += 4) b = highRate.strength(t, 0.4);
        expect(a).toBeCloseTo(b, 10);
        expect(a).toBe(1);
    });

    it('starts dim, reaches full, and resets after a pause', () => {
        const envelope = new MovementEnvelope();
        expect(envelope.strength(0, 0.4)).toBeCloseTo(0.05);
        for (let time = 100; time <= 400; time += 100) envelope.strength(time, 0.4);
        expect(envelope.strength(400, 0.4)).toBe(1);
        expect(envelope.strength(600, 0.4)).toBeCloseTo(0.05);
        expect(envelope.strength(601, 0)).toBe(1);
    });

    it('rasterizes and commits one coalesced large-radius batch once', () => {
        const field = new CursorDensityField();
        field.resize(256, 256);
        const version = field.version;
        const points = Array.from({ length: 40 }, (_, i) => ({
            x: -0.9 + i * 0.045,
            y: Math.sin(i / 6) * 0.2,
            timeStamp: i * 2,
        }));
        expect(field.addStrokeBatch(points, 0.8, 1, 0)).toBe(true);
        expect(field.rasterPasses).toBe(1);
        expect(field.version).toBe(version + 1);
        expect(maximum(field)).toBeGreaterThan(0);
    });

    it('does not paint stationary input or bridge ended strokes', () => {
        const field = new CursorDensityField();
        field.resize(256, 256);
        expect(field.addStrokeBatch([{ x: -0.8, y: 0, timeStamp: 0 }], 0.1, 1, 0)).toBe(false);
        field.endStroke(false);
        expect(field.addStrokeBatch([{ x: 0.8, y: 0, timeStamp: 20 }], 0.1, 1, 0)).toBe(false);
        expect(maximum(field)).toBe(0);
    });
});
