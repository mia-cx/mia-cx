import { describe, expect, it } from 'vitest';
import { POST_KINDS } from './pipeline';
import { RGB_COLOUR_KINDS } from './colour-effects';
import {
    WEBGL2_FRAGMENT_SOURCE,
    WEBGL2_STARTUP_SCALE,
    WEBGL2_SUPPORTED_COLOUR,
    WEBGL2_SUPPORTED_POST,
    WebGL2Renderer,
} from './webgl2-renderer';
import * as shaders from './webgl2-shaders';

describe('WebGL2 parity backend', () => {
    it('uses the canonical translated multipass shader inventory', () => {
        expect(WEBGL2_STARTUP_SCALE).toBe(0.5);
        expect(WEBGL2_FRAGMENT_SOURCE).toBe(shaders.BASE);
        expect(Object.keys(shaders).sort()).toEqual(
            [
                'BASE',
                'BLOOM_BLUR',
                'BLOOM_EXTRACT',
                'BLUR',
                'COLOUR_EFFECT',
                'COPY',
                'DISPLAY',
                'GOD_RAYS',
                'LUT',
                'MATERIALIZE',
                'OCTAVE',
                'POST_EFFECT',
                'PRESENT',
            ].sort(),
        );
        for (const source of Object.values(shaders)) {
            expect(source).toContain('#version 300 es');
            expect(source).toContain('void main()');
        }
    });

    it('covers every schema post effect and reports none unsupported', () => {
        expect([...WEBGL2_SUPPORTED_POST]).toEqual(POST_KINDS);
        expect(WEBGL2_SUPPORTED_POST.size).toBe(25);
    });

    it('covers adjustments, grade, every RGB effect, and LUT', () => {
        expect([...WEBGL2_SUPPORTED_COLOUR].sort()).toEqual(
            [...RGB_COLOUR_KINDS, 'curve', 'levels', 'hsl', 'colour-grade'].sort(),
        );
    });

    it('builds the canonical post graph and presents only after internal passes', () => {
        const implementation = WebGL2Renderer.toString();
        const plan = implementation.indexOf('rendererStagePlan');
        const rays = implementation.indexOf('"GOD_RAYS"');
        const composite = implementation.indexOf('this.godRays.texture');
        const present = implementation.indexOf('"PRESENT"');
        expect(plan).toBeGreaterThan(0);
        expect(rays).toBeGreaterThan(plan);
        expect(composite).toBeGreaterThan(rays);
        expect(present).toBeGreaterThan(composite);
        expect(implementation).toContain('e.kind === "fused-vignette-film-grain" ? 25');
        expect(implementation).toContain('e.kind === "fused-film-grain-vignette" ? 26');
    });

    it('uses internal base resolution except for native presentation and god rays', () => {
        const implementation = WebGL2Renderer.toString();
        expect(implementation).toContain(
            'const internalResolution = [this.baseTargets[0].width, this.baseTargets[0].height]',
        );
        expect(implementation.match(/packUniform\(internalResolution/g)).toHaveLength(2);
        expect(implementation).toContain('data[0] = this.godRays.width');
        expect(implementation).toContain('data[0] = this.canvas.width');
        expect(implementation).not.toContain('packUniform([this.canvas.width, this.canvas.height]');
    });

    it('initializes datamosh history with the canonical unfiltered COPY shader', () => {
        const implementation = WebGL2Renderer.toString();
        expect(implementation).toContain('postStages.some((e) => e.kind === "datamosh")');
        expect(implementation).toContain('this.draw("COPY", this.history');
        expect(implementation).not.toContain('this.draw("DISPLAY", this.history');
        expect(shaders.COPY).toContain('texelFetch');
        expect(shaders.COPY).not.toContain('texture(');
        expect(implementation).toContain('if (postRan && !this.paused)');
    });

    it('adapts only from available, non-disjoint GPU elapsed queries with captured attribution', () => {
        const implementation = WebGL2Renderer.toString();
        expect(implementation).toContain('EXT_disjoint_timer_query_webgl2');
        expect(implementation).toContain('QUERY_RESULT_AVAILABLE');
        expect(implementation).toContain('GPU_DISJOINT_EXT');
        expect(implementation).toContain('elapsedNs / 1e6');
        expect(implementation).toContain('pending.generation !== this.adaptiveGeneration');
        expect(implementation).toContain('pending.scale');
        expect(implementation).toContain('this.adaptive.sampleGpu');
        expect(implementation).toContain('if (nextScale !== void 0) this.recreateTargets()');
        expect(implementation).not.toContain('performance.now() - this.fenceStartedAt');
    });

    it('renders one full-resolution frozen pause frame and restores adaptive rendering', () => {
        const implementation = WebGL2Renderer.toString();
        expect(implementation).toContain('this.paused ? this.options.renderScale : this.adaptive.effectiveScale');
        expect(implementation).toContain('if (v === this.paused) return');
        expect(implementation).toContain('this.recreateTargets(v)');
        expect(implementation).toContain('if (!preserveHistory) this.historyValid = false');
        expect(implementation).toContain('if (postRan && !this.paused)');
        expect(implementation).toContain('this.frame = (this.frame + 1)');
        expect(implementation).toContain('const timer = !this.paused && this.timerQuery');
    });
});
