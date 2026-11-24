import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./ShaderCanvas.svelte', import.meta.url), 'utf8');

describe('ShaderCanvas', () => {
    it('routes by GPU-density capability rather than renderer brand', () => {
        expect(source).toContain('renderer?.gpuCursorDensity === true');
        expect(source).toContain('if (!instance.gpuCursorDensity)');
        expect(source).not.toContain("renderer?.backend === 'webgpu'");
    });

    it('freezes the cursor and its density trail while still or in a hidden tab', () => {
        const animation = source.slice(source.indexOf('const animateCursor'), source.indexOf('const visibility'));
        const gate = animation.indexOf('if (!document.hidden && !paused)');
        expect(gate).toBeGreaterThan(-1);
        expect(animation.indexOf('cursorState.tick(dt)')).toBeGreaterThan(gate);
        expect(animation.indexOf('cursorDensityField.tick(')).toBeGreaterThan(gate);
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
