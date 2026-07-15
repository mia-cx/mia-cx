import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

describe('cursor density animation', () => {
    it('routes by GPU-density capability rather than renderer brand', () => {
        expect(source).toContain('renderer?.gpuCursorDensity === true');
        expect(source).toContain('if (!instance.gpuCursorDensity)');
        expect(source).not.toContain("renderer?.backend === 'webgpu'");
        expect(source).not.toContain("instance.backend === 'webgl2'");
    });

    it('decays and uploads while base evolution is paused, but freezes in hidden tabs', () => {
        const animation = source.slice(source.indexOf('const animateCursor'), source.indexOf('const visibility'));
        expect(animation).toContain('if (!document.hidden)');
        expect(animation).toContain('if (!paused)');
        expect(animation.indexOf('cursorState.tick(dt)')).toBeGreaterThan(animation.indexOf('if (!paused)'));
        expect(animation.indexOf('cursorDensityField.tick(')).toBeGreaterThan(animation.indexOf('if (!paused)'));
        expect(animation).toContain('if (painted || densityTick.changed)');
        expect(animation).not.toContain('if (!paused && !document.hidden)');
    });
});
