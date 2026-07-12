import { describe, expect, it } from 'vitest';
import { POST_KINDS } from './pipeline';
import { RGB_COLOUR_KINDS } from './colour-effects';
import {
    WEBGL2_FRAGMENT_SOURCE,
    WEBGL2_STARTUP_SCALE,
    WEBGL2_SUPPORTED_COLOUR,
    WEBGL2_SUPPORTED_POST,
    WebGL2Renderer,
    specializeWebGL2Shader,
} from './webgl2-renderer';
import * as shaders from './webgl2-shaders';
import * as compactShaders from './webgl2-compact-shaders';
import { PRESENT_SHADER_SOURCE } from './renderer';

describe('WebGL2 parity backend', () => {
    it('creates every stable integral shader variant without changing continuous uniforms', () => {
        for (const [name, count, declaration] of [
            ['POST_EFFECT', 28, 'const int kind = '] as const,
            ['COLOUR_EFFECT', 11, 'const int k = '] as const,
            ['OCTAVE', 5, 'const uint octave = '] as const,
        ]) {
            for (let index = 0; index < count; index++) {
                const source = specializeWebGL2Shader(name, index);
                expect(source).toContain(`${declaration}${index}${name === 'OCTAVE' ? 'u' : ''};`);
                expect(source).toContain('_group_0_binding_0_fs');
                expect(source).toBe(specializeWebGL2Shader(name, index));
            }
        }
    });

    it('lazily installs specialized programs and assigns samplers only at installation', () => {
        const implementation = WebGL2Renderer.toString();
        expect(implementation).toContain('this.programs.get(key) ?? this.installProgram');
        expect(implementation).toContain('name !== "POST_EFFECT"');
        expect(implementation).not.toContain('if (l) gl.uniform1i');
    });
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

    it('uses compact native-resolution PRESENT with canonical FXAA math and sampling', () => {
        const source = compactShaders.PRESENT;
        expect(source.length).toBeLessThan(shaders.PRESENT.length / 5);
        expect(source).not.toContain('U_block_0Fragment');
        expect(source).toContain('vec2(gl_FragCoord.x,_present_resolution.y-gl_FragCoord.y)');
        expect(source).toContain('textureLod(_group_0_binding_1_fs,uv,0.)');
        expect(source.match(/sampleAt\(/g)).toHaveLength(10);
        for (const constant of ['.299', '.587', '.114', '.0312', '.125', '.03125', '.0078125', '-8.', '8.']) {
            expect(source).toContain(constant);
            expect(PRESENT_SHADER_SOURCE).toContain(constant);
        }
        for (const position of [
            '(-1.,-1.)',
            '(1.,-1.)',
            '(-1.,1.)',
            '(1.,1.)',
            '(1./3.-.5)',
            '(2./3.-.5)',
            '*-.5',
            '*.5',
        ]) {
            expect(source).toContain(position);
            expect(PRESENT_SHADER_SOURCE).toContain(position);
        }
        expect(source).toContain('(lb<lM-range*.5||lb>lM+range*.5)?a:b');
        expect(PRESENT_SHADER_SOURCE).toContain('select(b,a,lb<lM-range*.5||lb>lM+range*.5)');
        expect(WebGL2Renderer.toString()).toContain('name === "PRESENT" ?');
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
        const present = implementation.lastIndexOf('"PRESENT"');
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

    it('gates and bounds asynchronous fence ablation without changing the normal path', () => {
        const implementation = WebGL2Renderer.toString();
        expect(implementation).toContain('new URLSearchParams(location.search).get("webglAblate") === "1"');
        expect(implementation).toContain('ablationSample === ABLATION_WARMUPS + ABLATION_SAMPLES');
        expect(implementation).toContain('pending.ablationVariant !== void 0');
        expect(implementation).toContain('label: `ablation:${variant.label}`');
        expect(implementation).not.toContain('.finish()');
        expect(implementation).not.toContain('readPixels');
    });

    it('uses canonical continuity-preserving ablation skips', () => {
        const implementation = WebGL2Renderer.toString();
        expect(implementation).toContain('ablation?.kind === "post" && ablation.index === stageIndex');
        expect(implementation).toContain('ablation?.kind === "octave" && ablation.index === i');
        expect(implementation).toContain('ablation?.kind === "all-post"');
        expect(implementation).toContain('ablation?.kind === "all-octaves"');
        expect(implementation).toContain('ablation?.kind !== "colour"');
        expect(implementation).toContain('ablation?.kind === "presentation-lite" ? "DISPLAY" : "PRESENT"');
    });

    it('renders one full-resolution frozen pause frame and restores adaptive rendering', () => {
        const implementation = WebGL2Renderer.toString();
        expect(implementation).toContain('this.paused ? this.options.renderScale : this.adaptive.effectiveScale');
        expect(implementation).toContain('if (v === this.paused) return');
        expect(implementation).toContain('this.recreateTargets(v)');
        expect(implementation).toContain('if (!preserveHistory) this.historyValid = false');
        expect(implementation).toContain('if (postRan && !this.paused)');
        expect(implementation).toContain('this.frame = (this.frame + 1)');
        expect(implementation).toContain('const timer = !ablationReady && !this.paused && this.timerQuery');
    });
});
