import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRESENT_SHADER_SOURCE, AtmosphereRenderer } from './renderer';
import { WebGL2Renderer } from './webgl2-renderer';
import { PRESENT as COMPACT_PRESENT } from './webgl2-compact-shaders';
import { PRESENT as GENERATED_PRESENT } from './webgl2-shaders';

const page = readFileSync(new URL('../routes/+page.svelte', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

describe('transparent shader presentation', () => {
    it('extracts alpha from clamped final RGB and keeps valid premultiplied colour', () => {
        const contract =
            'let rgb=clamp(c,vec3f(0),vec3f(1));let alpha=clamp(max(max(rgb.r,rgb.g),rgb.b),0.,1.);return vec4f(rgb,alpha)';
        expect(PRESENT_SHADER_SOURCE).toContain(contract);
        expect(PRESENT_SHADER_SOURCE).toContain('return present(rgbM)');
        expect(PRESENT_SHADER_SOURCE).toContain('return present(select(b,a,');
    });

    it('uses premultiplied canvas configuration in both backends', () => {
        expect(AtmosphereRenderer.toString()).toMatch(/alphaMode:\s*["']premultiplied["']/);
        const webgl = WebGL2Renderer.toString();
        expect(webgl).toMatch(/alpha:\s*true/);
        expect(webgl).toMatch(/premultipliedAlpha:\s*true/);
    });

    it('keeps generated and compact WebGL presentation on the canonical alpha contract', () => {
        expect(GENERATED_PRESENT).toContain('max(rgb.x, rgb.y)');
        expect(GENERATED_PRESENT).toContain('vec4(rgb, alpha)');
        expect(COMPACT_PRESENT).toContain('max(max(rgb.r,rgb.g),rgb.b)');
        expect(COMPACT_PRESENT.match(/present\(/g)).toHaveLength(3);
    });

    it('layers a semantic, interactive article beneath a pointer-transparent fixed canvas', () => {
        for (const element of ['<article>', '<h1>', '<h2>', '<blockquote>', '<ul>', '<a href=', '<time '])
            expect(page).toContain(element);
        expect(page).toContain('pointer-events: none');
        expect(page).toContain('background: transparent');
        expect(page).toContain("window.addEventListener('pointermove', move)");
        expect(page).toContain("event.target.closest('nav, .telemetry')");
        expect(page).not.toContain('onpointermove={pointerMove}');
    });

    it('uses full-bleed viewport metadata without wasteful canvas overscan', () => {
        expect(app).toContain('viewport-fit=cover');
        expect(page).not.toContain("window.addEventListener('scroll', syncCanvasScroll");
        expect(page).not.toContain('ios-overscan');
        expect(page).toContain('width: 100lvw');
        expect(page).toContain('height: 100lvh');
    });

    it('leaves the document root transparent for Safari browser chrome compositing', () => {
        expect(app).not.toContain('name="theme-color"');
        expect(page).toContain(':global(html, body)');
        expect(page).toContain('background: transparent');
        expect(page).toContain('main {');
        expect(page).toContain('background: #070809');
    });
});
