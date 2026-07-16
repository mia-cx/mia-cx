import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCubeAsset, parseCube, saveCubeAsset } from './colour-effects';

describe('.cube LUT assets', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });
    it('parses size, literal rows, title, and domain', () => {
        const lut = parseCube(
            'TITLE "Test"\nLUT_3D_SIZE 2\nDOMAIN_MIN -1 0 1\nDOMAIN_MAX 1 2 3\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1',
        );
        expect(lut).toMatchObject({ size: 2, title: 'Test', domainMin: [-1, 0, 1], domainMax: [1, 2, 3] });
        expect(Array.from(lut.data.slice(-3))).toEqual([1, 1, 1]);
    });
    it('round-trips through the in-memory fallback without IndexedDB', async () => {
        vi.stubGlobal('indexedDB', undefined);
        vi.stubGlobal('crypto', { randomUUID: () => 'fallback-id' });
        const lut = parseCube('LUT_3D_SIZE 2\n' + Array(8).fill('0.25 0.5 0.75').join('\n'));
        expect(await saveCubeAsset(lut, 'fallback.cube')).toBe('fallback-id');
        const loaded = await loadCubeAsset('fallback-id');
        expect(loaded?.name).toBe('fallback.cube');
        expect(loaded?.data).toBeInstanceOf(Float32Array);
        expect(await loadCubeAsset('missing')).toBeNull();
    });
});
