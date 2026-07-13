import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import defaultSettings from '$lib/default-settings.json';
import { BAKED_RENDER_OPTIONS, loadBakedRenderOptions } from '$lib/baked-settings';
import { composeAdjustmentLut } from '$lib/adjustments';
import { leadingAdjustmentRegion, rendererStagePlan } from '$lib/pipeline';

const source = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

describe('baked shader-only page', () => {
    it('contains only the canvas and nonvisual status fallback', () => {
        expect(source).toContain('<canvas');
        for (const markup of ['<main', '<article', '<header', '<nav', '<button', '<input', '<select'])
            expect(source).not.toContain(markup);
        for (const ui of ['telemetry', 'FPS', 'Export settings', 'Reset defaults', 'ParameterEditor'])
            expect(source).not.toContain(ui);
    });

    it('uses canonical JSON defaults directly and generated immutable products', async () => {
        expect(BAKED_RENDER_OPTIONS.seed).toBe(defaultSettings.settings.seed);
        expect(BAKED_RENDER_OPTIONS.parameters).toBe(defaultSettings.settings.parameters);
        expect(BAKED_RENDER_OPTIONS.colour).toBe(defaultSettings.settings.colour);
        expect(BAKED_RENDER_OPTIONS.post).toBe(defaultSettings.settings.post);
        const bytes = readFileSync(new URL('../../static/baked-adjustment-lut.bin', import.meta.url));
        const loaded = await loadBakedRenderOptions(async () => new Response(bytes));
        expect([...loaded.bakedAdjustmentLut!]).toEqual([
            ...composeAdjustmentLut(leadingAdjustmentRegion(defaultSettings.settings.colour as never)),
        ]);
        expect(BAKED_RENDER_OPTIONS.bakedPostPlan).toEqual(
            rendererStagePlan(defaultSettings.settings.post as never, defaultSettings.settings.parameters),
        );
        expect(BAKED_RENDER_OPTIONS.bakedPostParameters).toBeInstanceOf(Float32Array);
        expect(source).not.toMatch(/localStorage|shaderSettings|normalizeSavedSettings|loadCubeAsset|IndexedDB/i);
    });

    it('bypasses immutable per-frame JSON keys in both backends without removing GPU adaptation evidence', () => {
        const webgpu = readFileSync(new URL('../lib/renderer.ts', import.meta.url), 'utf8');
        const webgl = readFileSync(new URL('../lib/webgl2-renderer.ts', import.meta.url), 'utf8');
        for (const backend of [webgpu, webgl]) {
            expect(backend).toContain('bakedPostParameters');
            expect(backend).toContain('bakedLeadingAdjustments');
            expect(backend).toMatch(/frameTiming|timerQuery/);
            expect(backend).toContain('adaptive');
        }
    });
});
