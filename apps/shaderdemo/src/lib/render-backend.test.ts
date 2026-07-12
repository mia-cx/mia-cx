import { describe, expect, it, vi } from 'vitest';
import { selectRenderBackend, type RenderBackend } from './render-backend';

const backend = (name: 'webgpu' | 'webgl2') =>
    ({
        backend: name,
        setOptions: vi.fn(),
        setCursorState: vi.fn(),
        setPaused: vi.fn(),
        invalidate: vi.fn(),
        destroy: vi.fn(),
    }) as RenderBackend;
const canvas = {} as HTMLCanvasElement;
const options = {} as never;

describe('render backend selection', () => {
    it('prefers WebGPU and does not initialize WebGL2', async () => {
        const webgpu = vi.fn().mockResolvedValue(backend('webgpu'));
        const webgl2 = vi.fn().mockResolvedValue(backend('webgl2'));
        const selected = await selectRenderBackend(canvas, options, { webgpu, webgl2 });
        expect(selected.renderer.backend).toBe('webgpu');
        expect(webgl2).not.toHaveBeenCalled();
    });
    it('falls back once when WebGPU is unavailable or initialization fails', async () => {
        const webgl2 = vi.fn().mockResolvedValue(backend('webgl2'));
        const selected = await selectRenderBackend(canvas, options, {
            webgpu: vi.fn().mockRejectedValue(new Error('adapter failed')),
            webgl2,
        });
        expect(selected.renderer.backend).toBe('webgl2');
        expect(selected.warnings[0]).toContain('WebGPU unavailable: adapter failed');
        expect(webgl2).toHaveBeenCalledOnce();
    });
    it('reports both failures readably', async () => {
        await expect(
            selectRenderBackend(canvas, options, {
                webgpu: vi.fn().mockRejectedValue(new Error('no adapter')),
                webgl2: vi.fn().mockRejectedValue(new Error('no context')),
            }),
        ).rejects.toThrow(
            'No supported graphics backend. WebGPU unavailable: no adapter WebGL2 unavailable: no context',
        );
    });
});
