import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./ShaderCanvas.svelte', import.meta.url), 'utf8');

describe('ShaderCanvas', () => {
    it('routes by GPU-density capability rather than renderer brand', () => {
        expect(source).toContain('renderer?.gpuCursorDensity === true');
        expect(source).toContain('if (!instance.gpuCursorDensity)');
        expect(source).not.toContain("renderer?.backend === 'webgpu'");
    });

    it('decays and uploads while base evolution is paused, but freezes in hidden tabs', () => {
        const animation = source.slice(source.indexOf('const animateCursor'), source.indexOf('const visibility'));
        expect(animation).toContain('if (!document.hidden)');
        expect(animation).toContain('if (!paused)');
        expect(animation.indexOf('cursorState.tick(dt)')).toBeGreaterThan(animation.indexOf('if (!paused)'));
    });

    it('seeds every page load and honours the render scale prop', () => {
        expect(source).toContain('const pageSeed = Math.random() * 1000');
        expect(source).toContain('{ ...loadedOptions, seed: pageSeed, renderScale, dprCap }');
    });

    it('pauses the field for reduced motion and destroys the renderer on unmount', () => {
        expect(source).toContain("matchMedia('(prefers-reduced-motion: reduce)').matches");
        expect(source).toContain('renderer?.destroy()');
    });
});
