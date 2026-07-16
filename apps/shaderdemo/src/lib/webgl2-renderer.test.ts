import { describe, expect, it } from 'vitest';
import { POST_KINDS } from './pipeline';
import { RGB_COLOUR_KINDS } from './colour-effects';
import {
    WEBGL2_CURSOR_DECAY_SOURCE,
    WEBGL2_CURSOR_PAINT_FRAGMENT_SOURCE,
    WEBGL2_CURSOR_PAINT_VERTEX_SOURCE,
    WEBGL2_FRAGMENT_SOURCE,
    WEBGL2_STARTUP_SCALE,
    WEBGL2_SUPPORTED_COLOUR,
    WEBGL2_SUPPORTED_POST,
    WebGL2Renderer,
    specializeWebGL2Shader,
} from './webgl2-renderer';
import * as shaders from './webgl2-shaders';
import * as compactShaders from './webgl2-compact-shaders';
import { BASE_SHADER_SOURCE, PRESENT_SHADER_SOURCE } from './renderer';

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

    it('uses compact shaders for every baked Post stage and radial aberration', () => {
        for (const kind of [1, 2, 3, 27]) {
            const specialized = specializeWebGL2Shader('POST_EFFECT', kind);
            expect(specialized.length).toBeLessThan(shaders.POST_EFFECT.length / 2);
            expect(specialized.match(/void main\(\)/g)).toHaveLength(1);
        }
        const source = specializeWebGL2Shader('POST_EFFECT', 3);
        expect(source).toContain('vec2 radial = uv - vec2(0.5)');
        expect(source).toContain('uv + radial * amount');
        expect(source).toContain('uv - radial * amount');
        expect(source).not.toContain('vec2(d, 0.0)');
        const godRaysComposite = specializeWebGL2Shader('POST_EFFECT', 27);
        expect(godRaysComposite).toContain('texture(_group_0_binding_3_fs, vec2(uv.x, 1.0 - uv.y))');
        expect(godRaysComposite).not.toContain('texture(_group_0_binding_3_fs, uv)');
    });

    it('lazily installs specialized programs and assigns samplers only at installation', () => {
        const implementation = WebGL2Renderer.toString();
        expect(implementation).toContain('this.programs.get(key) ?? this.installProgram');
        expect(implementation).toContain('name !== "POST_EFFECT"');
        expect(implementation).not.toContain('if (l) gl.uniform1i');
    });
    it('uses the canonical translated multipass shader inventory', () => {
        expect(WEBGL2_STARTUP_SCALE).toBe(0.25);
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

    it('samples the persistent density texture with generated GLSL parity', () => {
        expect(shaders.BASE).toContain('uniform highp sampler2D _group_0_binding_2_fs;');
        expect(shaders.BASE).toContain('texture(_group_0_binding_2_fs, vec2(uv))');
        expect(shaders.BASE).toMatch(/float densityPressure = _e\d+\.x;/);
        expect(shaders.BASE).toMatch(/cursorDensity = \(_e\d+ \* densityPressure\);/);
        expect(shaders.BASE).toMatch(/float _e\d+ = cp\(3u\);/);
        expect(shaders.BASE).toMatch(
            /float densityResponse = \(\(_e\d+ == 0\.0\) \? 1\.0 : pow\(max\(\(1\.0 - clamp\(_e\d+, 0\.0, 1\.0\)\), 1e-6\), _e\d+\)\);/,
        );
        expect(shaders.BASE).toMatch(/natural = \(_e\d+ \+ \(_e\d+ \* densityResponse\)\);/);
        expect(shaders.BASE.indexOf('float densityResponse =')).toBeGreaterThan(
            shaders.BASE.indexOf('natural = (_e342 * exp2'),
        );
        expect(BASE_SHADER_SOURCE).toContain('let darkBias=cp(3u);');
        expect(BASE_SHADER_SOURCE).toContain('select(pow(max(1.-clamp(natural,0.,1.),1e-6),darkBias),1.,darkBias==0.)');
        expect(shaders.BASE.match(/texture\(_group_0_binding_2_fs/g)).toHaveLength(1);
        expect(shaders.BASE).not.toContain('vec2 gradient =');
        expect(shaders.BASE).not.toContain('textureSize(_group_0_binding_2_fs');
        expect(shaders.BASE).not.toContain('headEnergy');
        expect(shaders.BASE).not.toContain('float trail =');
        expect(shaders.BASE).not.toContain('halogen');
    });

    it('keeps WebGL2 cursor density GPU-resident with faithful decay and max paint contracts', () => {
        const implementation = WebGL2Renderer.toString();
        expect(implementation).toContain('gpuCursorDensity = true');
        expect(implementation).toContain('gl.R16F');
        expect(implementation).toContain('Array.from({ length: 2 }');
        expect(implementation).toContain('this.renderCursorDensity()');
        expect(implementation.indexOf('this.renderCursorDensity()')).toBeLessThan(
            implementation.indexOf('this.draw("BASE"'),
        );
        expect(implementation).toContain('gl.blendEquation(gl.MAX)');
        expect(implementation).toContain('gl.drawArraysInstanced');
        expect(implementation).toContain('appendBoundedDensitySegments');
        expect(implementation).not.toContain('texSubImage2D');
        expect(implementation).not.toContain('readPixels');
        expect(implementation).not.toContain('gl.finish');
        expect(WEBGL2_CURSOR_DECAY_SOURCE).toContain('*decay');
        expect(WEBGL2_CURSOR_PAINT_VERTEX_SOURCE).toContain('min(a,b)-values.x');
        expect(WEBGL2_CURSOR_PAINT_VERTEX_SOURCE).toContain('layout(location=2) in vec2 corner');
        expect(WEBGL2_CURSOR_PAINT_VERTEX_SOURCE).not.toContain('gl_VertexID');
        expect(implementation).toContain('gl.vertexAttribDivisor(2, 0)');
        expect(WEBGL2_CURSOR_PAINT_FRAGMENT_SOURCE).toContain('log(1.+9.*distance)/log(10.)');
        expect(WEBGL2_CURSOR_PAINT_FRAGMENT_SOURCE).toContain('12.*max(paintValues.z,0.)');
        expect(WEBGL2_CURSOR_PAINT_FRAGMENT_SOURCE).toContain('(distance-.92)/.08');
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
        expect(implementation).toContain('this.pendingTimerQueries.length === 0');
        expect(implementation).toContain('TIMER_QUERY_WATCHDOG_MS');
        expect(implementation).toContain('this.disableTimerQueries()');
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

    it('renders at browser cadence and advances evolution from elapsed time', () => {
        const implementation = WebGL2Renderer.toString();
        expect(implementation).not.toContain('1000 / 30');
        expect(implementation).not.toContain('lastPresented');
        expect(implementation).toContain('Math.max(0, (now - this.lastTick) / 1e3) * p.animationSpeed');
    });
});
