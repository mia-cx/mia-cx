import { describe, expect, it } from 'vitest';
import {
    DENSITY_MAP_MAX_COLUMNS,
    DENSITY_MAP_ROWS,
    GpuDensityGeometry,
    MAX_GPU_DENSITY_SEGMENTS,
    appendBoundedDensitySegments,
    densityMapSize,
} from './cursor-density-gpu';

describe('GPU cursor density geometry', () => {
    it('sizes maps defensively and bounds extreme aspect ratios', () => {
        expect(densityMapSize(100, 100)).toEqual({ width: DENSITY_MAP_ROWS, height: DENSITY_MAP_ROWS });
        expect(densityMapSize(Infinity, Number.NaN)).toEqual({ width: DENSITY_MAP_ROWS, height: DENSITY_MAP_ROWS });
        expect(densityMapSize(1e9, 1)).toEqual({ width: DENSITY_MAP_MAX_COLUMNS, height: DENSITY_MAP_ROWS });
    });

    it('bounds queued work deterministically and reports dropped segments', () => {
        const backlog = Array.from({ length: MAX_GPU_DENSITY_SEGMENTS }, (_, i) => i);
        expect(appendBoundedDensitySegments(backlog, [2048, 2049])).toBe(2);
        expect(backlog).toHaveLength(MAX_GPU_DENSITY_SEGMENTS);
        expect(backlog[backlog.length - 1]).toBe(2049);
    });

    it('reset prevents a stale bridge and invalid scalars never reach segments', () => {
        const geometry = new GpuDensityGeometry();
        geometry.add([{ x: 0, y: 0, timeStamp: 0 }], 0.1, 1, 1);
        geometry.reset();
        expect(geometry.add([{ x: 1, y: 1, timeStamp: 10 }], 0.1, 1, 1)).toEqual([]);
        const segments = geometry.add([{ x: 1.1, y: 1.1, timeStamp: 20 }], Number.NaN, Infinity, Number.NaN);
        expect(segments.length).toBeGreaterThan(0);
        expect(Object.values(segments[0]).every(Number.isFinite)).toBe(true);
    });

    it('uses timestamps, not event frequency, for build-up strength', () => {
        const run = (middle: number[]) => {
            const geometry = new GpuDensityGeometry();
            geometry.add([{ x: 0, y: 0, timeStamp: 0 }], 0.02, 1, 1);
            let result = [] as ReturnType<GpuDensityGeometry['add']>;
            for (const timeStamp of [...middle, 1000])
                result = geometry.add([{ x: timeStamp / 1000, y: 0, timeStamp }], 0.02, 1, 1);
            return result[result.length - 1]!.strength;
        };
        expect(run([])).toBeCloseTo(run([250, 500, 750]), 6);
    });
});
