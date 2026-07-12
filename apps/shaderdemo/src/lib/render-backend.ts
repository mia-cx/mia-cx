import type { GpuTimingStats, RenderOptions } from './renderer';
import type { FrameRollingSummary } from './telemetry';

export type RendererBackendName = 'webgpu' | 'webgl2';

export interface RenderBackend {
    readonly backend: RendererBackendName;
    readonly unsupportedEffects?: readonly string[];
    onStats?: (fps: number, width: number, height: number, rolling?: FrameRollingSummary, renderScale?: number) => void;
    onGpuStats?: (stats: GpuTimingStats | null) => void;
    onLost?: (message: string) => void;
    setOptions(options: RenderOptions): void;
    setPaused(paused: boolean): void;
    invalidate(): void;
    destroy(): void;
}

type Factory = (canvas: HTMLCanvasElement, options: RenderOptions) => Promise<RenderBackend>;

export interface BackendSelection {
    renderer: RenderBackend;
    warnings: string[];
}

const readable = (name: string, error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    return `${name} unavailable${detail ? `: ${detail}` : ''}`;
};

/** Try each backend exactly once. A failed GPU cannot create an automatic crash loop. */
export async function selectRenderBackend(
    canvas: HTMLCanvasElement,
    options: RenderOptions,
    factories?: { webgpu: Factory; webgl2: Factory },
): Promise<BackendSelection> {
    const implementations =
        factories ??
        ({
            webgpu: async (target, value) => {
                const { AtmosphereRenderer } = await import('./renderer');
                return AtmosphereRenderer.create(target, value);
            },
            webgl2: async (target, value) => {
                const { WebGL2Renderer } = await import('./webgl2-renderer');
                return WebGL2Renderer.create(target, value);
            },
        } satisfies { webgpu: Factory; webgl2: Factory });
    const warnings: string[] = [];
    try {
        return { renderer: await implementations.webgpu(canvas, options), warnings };
    } catch (error) {
        warnings.push(readable('WebGPU', error));
    }
    try {
        return { renderer: await implementations.webgl2(canvas, options), warnings };
    } catch (error) {
        warnings.push(readable('WebGL2', error));
    }
    throw new Error(`No supported graphics backend. ${warnings.join(' ')}`);
}
