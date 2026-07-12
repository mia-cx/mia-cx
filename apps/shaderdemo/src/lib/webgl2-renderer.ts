import type { RenderBackend } from './render-backend';
import {
    COLOUR_KIND_INDEX,
    OCTAVE_COUNT,
    POST_KIND_INDEX,
    POST_PARAMETER_SCHEMA,
    packUniform,
    octaveBlurIsActive,
    octaveEffectIsActive,
    renderSize,
    scaledSize,
    datamoshIsActive,
    type RenderOptions,
} from './renderer';
import { composeAdjustmentLut, ADJUSTMENT_LUT_SIZE, isNeutralAdjustment } from './adjustments';
import { cubeRgba16Data } from './renderer';
import { leadingAdjustmentRegion, rendererStagePlan } from './pipeline';
import { AdaptiveResolutionController } from './adaptive-resolution';
import { isNeutralRgb, isRgbColour } from './colour-effects';
import { FrameTelemetry } from './telemetry';
import * as shader from './webgl2-shaders';
import * as compactShader from './webgl2-compact-shaders';

export const WEBGL2_STARTUP_SCALE = 0.5;
/** WebGL2 implements the complete canonical inventory. Kept as an export for capability UI/tests. */
export const WEBGL2_SUPPORTED_POST = new Set(Object.keys(POST_KIND_INDEX));
export const WEBGL2_SUPPORTED_COLOUR = new Set([
    ...Object.keys(COLOUR_KIND_INDEX),
    'curve',
    'levels',
    'hsl',
    'colour-grade',
]);
export const WEBGL2_FRAGMENT_SOURCE = shader.BASE;
const VERTEX = `#version 300 es
const vec2 P[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
void main(){gl_Position=vec4(P[gl_VertexID],0.,1.);}`;
type ProgramName = keyof typeof shader;
type SpecializedProgramName = `${'POST_EFFECT' | 'COLOUR_EFFECT' | 'OCTAVE'}:${number}`;
type ProgramKey = ProgramName | SpecializedProgramName;
const SELECTORS = {
    POST_EFFECT: 'float _e16 = _group_0_binding_0_fs.blurRadii[1].z;\n    int kind = int(_e16);',
    COLOUR_EFFECT: 'float _e15 = _group_0_binding_0_fs.blurRadii[1].z;\n    int k = int(_e15);',
    OCTAVE: 'float _e11 = _group_0_binding_0_fs.octaveIndex;\n    uint octave = uint(_e11);',
} as const;
export function specializeWebGL2Shader(name: keyof typeof SELECTORS, index: number): string {
    const source = shader[name],
        selector = SELECTORS[name];
    const matches = source.split(selector).length - 1;
    if (matches !== 1) throw new Error(`Expected exactly one ${name} selector, found ${matches}.`);
    const replacement =
        name === 'POST_EFFECT'
            ? `const int kind = ${index};`
            : name === 'COLOUR_EFFECT'
              ? `const int k = ${index};`
              : `const uint octave = ${index}u;`;
    return source.replace(selector, replacement);
}
type TimerQueryExtension = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
type PendingTimerQuery = { query: WebGLQuery; scale: number; generation: number };
type PendingFence = { sync: WebGLSync; submittedAt: number; scale: number; generation: number };
const FENCE_POLL_MS = 4;
const FENCE_EMERGENCY_MS = 750;
export type WebGL2TargetKind = 'base' | 'colour' | 'post' | 'god-rays';
type Target = {
    texture: WebGLTexture;
    framebuffer: WebGLFramebuffer;
    width: number;
    height: number;
    kind: WebGL2TargetKind;
};
export const WEBGL2_TARGET_FORMATS = {
    base: 'R16F',
    colour: 'RGBA16F',
    post: 'RGBA8',
    history: 'RGBA8',
    'god-rays': 'RGBA16F',
} as const;

/** Convert GLSL's bottom-left fragment position to canonical WGSL top-left coordinates. */
export function topLeftFragmentCoordinates(source: string) {
    return source.replaceAll(
        'vec4 pos = gl_FragCoord;',
        'vec4 pos = vec4(gl_FragCoord.x, _group_0_binding_0_fs.resolution.y - gl_FragCoord.y, gl_FragCoord.zw);',
    );
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
    const value = gl.createShader(type);
    if (!value) throw new Error('Could not allocate a WebGL2 shader.');
    gl.shaderSource(value, source);
    gl.compileShader(value);
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(value) || 'unknown shader error';
        gl.deleteShader(value);
        throw new Error(`WebGL2 shader compilation failed: ${message}`);
    }
    return value;
}
function program(gl: WebGL2RenderingContext, fragment: string) {
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX),
        fs = compile(gl, gl.FRAGMENT_SHADER, topLeftFragmentCoordinates(fragment)),
        p = gl.createProgram();
    if (!p) throw new Error('Could not allocate a WebGL2 program.');
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        throw new Error(`WebGL2 program link failed: ${gl.getProgramInfoLog(p)}`);
    return p;
}

export class WebGL2Renderer implements RenderBackend {
    readonly backend = 'webgl2' as const;
    readonly unsupportedEffects: string[] = [];
    onStats: RenderBackend['onStats'];
    onGpuStats: RenderBackend['onGpuStats'];
    onLost: RenderBackend['onLost'];
    private programs = new Map<ProgramKey, WebGLProgram>();
    private baseTargets: Target[] = [];
    private colourTargets: Target[] = [];
    private postTargets: Target[] = [];
    private godRays?: Target;
    private history?: Target;
    private uniformBuffer: WebGLBuffer;
    private vao: WebGLVertexArrayObject;
    private raf = 0;
    private pendingFence: PendingFence | null = null;
    private fencePollTimer: ReturnType<typeof setTimeout> | undefined;
    private paused = false;
    private destroyed = false;
    private invalid = true;
    private frame = 0;
    private simTime = 0;
    private lastTick = performance.now();
    private lastPresented = 0;
    private historyValid = false;
    private datamoshWasActive = false;
    private adaptive: AdaptiveResolutionController;
    private timerQuery?: TimerQueryExtension;
    private pendingTimerQueries: PendingTimerQuery[] = [];
    private adaptiveGeneration = 0;
    private telemetry = new FrameTelemetry();
    private observer: ResizeObserver;
    private lutTextures = new Map<string, WebGLTexture>();
    private adjustmentTexture?: WebGLTexture;
    private samplerLocations = new Map<WebGLProgram, (WebGLUniformLocation | null)[]>();
    private currentProgram: WebGLProgram | null = null;
    private currentVao: WebGLVertexArrayObject | null = null;
    private currentViewport = '';
    private currentFramebuffer: WebGLFramebuffer | null | undefined = undefined;
    private activeUnit = -1;
    private boundTextures = new Map<string, WebGLTexture | null>();
    private postPlanKey = '';
    private cachedPostPlan: ReturnType<typeof rendererStagePlan> = [];
    private postParameterKey = '';
    private cachedPostParameters = new Float32Array(POST_PARAMETER_SCHEMA.length);
    private leadingKey = '';
    private cachedLeading: ReturnType<typeof leadingAdjustmentRegion> = [];
    private webglProfile =
        typeof location !== 'undefined' && new URLSearchParams(location.search).get('webglProfile') === '1';
    private webglProfileDeadline = performance.now() + 5000;
    private webglProfileFrame = 0;
    private webglProfileCurrent: Map<string, number> | null = null;
    private webglProfileTotals = new Map<string, number>();
    private constructor(
        private canvas: HTMLCanvasElement,
        private gl: WebGL2RenderingContext,
        private options: RenderOptions,
    ) {
        const ubo = gl.createBuffer(),
            vao = gl.createVertexArray();
        if (!ubo || !vao) throw new Error('WebGL2 resource allocation failed.');
        this.uniformBuffer = ubo;
        this.vao = vao;
        this.adaptive = new AdaptiveResolutionController(options.renderScale, {
            initialScale: Math.min(WEBGL2_STARTUP_SCALE, options.renderScale),
            severeSamples: 1,
        });
        this.timerQuery = gl.getExtension('EXT_disjoint_timer_query_webgl2') ?? undefined;
        this.observer = new ResizeObserver(() => {
            this.resize();
            this.invalidate();
        });
    }
    static async create(canvas: HTMLCanvasElement, options: RenderOptions) {
        const gl = canvas.getContext('webgl2', {
            alpha: false,
            antialias: false,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: false,
        });
        if (!gl) throw new Error('This browser did not provide a WebGL2 context.');
        if (!gl.getExtension('EXT_color_buffer_float'))
            throw new Error('WebGL2 floating-point render targets are unavailable.');
        const self = new WebGL2Renderer(canvas, gl, options);
        for (const name of Object.keys(shader) as ProgramName[])
            if (name !== 'POST_EFFECT' && name !== 'COLOUR_EFFECT' && name !== 'OCTAVE')
                self.installProgram(name, name === 'PRESENT' ? compactShader.PRESENT : shader[name]);
        gl.bindBuffer(gl.UNIFORM_BUFFER, self.uniformBuffer);
        gl.bufferData(gl.UNIFORM_BUFFER, 180 * 4, gl.DYNAMIC_DRAW);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, self.uniformBuffer);

        canvas.addEventListener('webglcontextlost', self.contextLost);
        canvas.addEventListener('webglcontextrestored', self.contextRestored);
        self.observer.observe(canvas);
        self.resize();
        self.onGpuStats?.(null);
        self.render(performance.now());
        self.schedule();
        return self;
    }
    private installProgram(key: ProgramKey, source: string) {
        const gl = this.gl,
            p = program(gl, source);
        this.programs.set(key, p);
        const i = gl.getUniformBlockIndex(p, 'U_block_0Fragment');
        if (i !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, i, 0);
        const locations = [
            gl.getUniformLocation(p, '_group_0_binding_1_fs'),
            gl.getUniformLocation(p, '_group_0_binding_3_fs'),
            gl.getUniformLocation(p, '_group_0_binding_4_fs'),
            gl.getUniformLocation(p, '_present_resolution'),
        ];
        this.samplerLocations.set(p, locations);
        gl.useProgram(p);
        this.currentProgram = p;
        if (locations[0]) gl.uniform1i(locations[0], 0);
        if (locations[1]) gl.uniform1i(locations[1], 1);
        if (locations[2]) gl.uniform1i(locations[2], 1);
        return p;
    }
    private specialized(name: keyof typeof SELECTORS, index: number) {
        const key = `${name}:${index}` as SpecializedProgramName;
        return this.programs.get(key) ?? this.installProgram(key, specializeWebGL2Shader(name, index));
    }
    private makeTarget(kind: WebGL2TargetKind, width: number, height: number): Target {
        const gl = this.gl,
            texture = gl.createTexture(),
            framebuffer = gl.createFramebuffer();
        if (!texture || !framebuffer) throw new Error('WebGL2 target allocation failed.');
        gl.bindTexture(gl.TEXTURE_2D, texture);
        for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
            gl.texParameteri(gl.TEXTURE_2D, key, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const single = kind === 'base',
            post = kind === 'post';
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            single ? gl.R16F : post ? gl.RGBA8 : gl.RGBA16F,
            width,
            height,
            0,
            single ? gl.RED : gl.RGBA,
            post ? gl.UNSIGNED_BYTE : gl.HALF_FLOAT,
            null,
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        this.currentFramebuffer = framebuffer;
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
            throw new Error(`WebGL2 ${kind} framebuffer is incomplete.`);
        this.boundTextures.clear();
        return { texture, framebuffer, width, height, kind };
    }
    private allTargets() {
        return [
            ...this.baseTargets,
            ...this.colourTargets,
            ...this.postTargets,
            ...(this.godRays ? [this.godRays] : []),
            ...(this.history ? [this.history] : []),
        ];
    }
    private recreateTargets(preserveHistory = this.paused) {
        const gl = this.gl;
        for (const x of this.allTargets().filter((target) => !preserveHistory || target !== this.history)) {
            gl.deleteTexture(x.texture);
            gl.deleteFramebuffer(x.framebuffer);
        }
        // Pausing uses full configured quality without teaching the adaptive controller that this should
        // become its continuous workload.  Its effective scale remains the resume scale.
        const targetScale = this.paused ? this.options.renderScale : this.adaptive.effectiveScale;
        const size = scaledSize(this.canvas.width, this.canvas.height, targetScale);
        this.baseTargets = [
            this.makeTarget('base', size.width, size.height),
            this.makeTarget('base', size.width, size.height),
        ];
        this.colourTargets = [
            this.makeTarget('colour', size.width, size.height),
            this.makeTarget('colour', size.width, size.height),
        ];
        this.postTargets = [
            this.makeTarget('post', size.width, size.height),
            this.makeTarget('post', size.width, size.height),
        ];
        if (!preserveHistory || !this.history) this.history = this.makeTarget('post', size.width, size.height);
        this.godRays = this.makeTarget(
            'god-rays',
            Math.max(1, Math.round(size.width * this.options.parameters.godRaysRenderScale)),
            Math.max(1, Math.round(size.height * this.options.parameters.godRaysRenderScale)),
        );
        if (!preserveHistory) this.historyValid = false;
        this.adaptiveGeneration += 1;
    }
    private upload(data: Float32Array) {
        this.gl.bufferSubData(this.gl.UNIFORM_BUFFER, 0, data);
    }
    private draw(
        name: ProgramKey,
        destination: Target | null,
        source?: WebGLTexture,
        aux?: WebGLTexture,
        cube?: WebGLTexture,
        profileLabel?: string,
    ) {
        const gl = this.gl,
            p = this.programs.get(name)!;
        const framebuffer = destination?.framebuffer ?? null;
        if (framebuffer !== this.currentFramebuffer) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            this.currentFramebuffer = framebuffer;
        }
        const width = destination?.width ?? this.canvas.width,
            height = destination?.height ?? this.canvas.height;
        const viewport = `${width}x${height}`;
        if (viewport !== this.currentViewport) {
            gl.viewport(0, 0, width, height);
            this.currentViewport = viewport;
        }
        if (p !== this.currentProgram) {
            gl.useProgram(p);
            this.currentProgram = p;
        }
        if (name === 'PRESENT') {
            const resolution = this.samplerLocations.get(p)![3];
            if (resolution) gl.uniform2f(resolution, width, height);
        }
        if (this.vao !== this.currentVao) {
            gl.bindVertexArray(this.vao);
            this.currentVao = this.vao;
        }
        const bind = (unit: number, tex: WebGLTexture | undefined, target: number = gl.TEXTURE_2D) => {
            if (!tex) return;
            if (this.activeUnit !== unit) {
                gl.activeTexture(gl.TEXTURE0 + unit);
                this.activeUnit = unit;
            }
            const key = `${unit}:${target}`;
            if (this.boundTextures.get(key) !== tex) {
                gl.bindTexture(target, tex);
                this.boundTextures.set(key, tex);
            }
        };
        bind(0, source);
        bind(1, aux);
        bind(1, cube, gl.TEXTURE_3D);
        if (this.webglProfileCurrent && profileLabel) {
            const started = performance.now();
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.finish();
            this.webglProfileCurrent.set(
                profileLabel,
                (this.webglProfileCurrent.get(profileLabel) ?? 0) + performance.now() - started,
            );
        } else gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    private uploadCube(data: Uint16Array, size: number) {
        const gl = this.gl,
            t = gl.createTexture();
        if (!t) throw new Error('WebGL2 LUT allocation failed.');
        gl.bindTexture(gl.TEXTURE_3D, t);
        for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
            gl.texParameteri(gl.TEXTURE_3D, key, gl.LINEAR);
        for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R])
            gl.texParameteri(gl.TEXTURE_3D, key, gl.CLAMP_TO_EDGE);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, size, size, size, 0, gl.RGBA, gl.HALF_FLOAT, data);
        this.boundTextures.clear();
        return t;
    }
    private render(now: number) {
        const targets = this.colourTargets;
        if (!targets.length) return;
        const p = this.options.parameters;
        // Let normal asynchronous adaptation settle first. Slow Safari devices reach the floor quickly;
        // fast devices profile their stable scale after a bounded five-second wait.
        const profileReady = this.adaptive.effectiveScale <= 0.126 || performance.now() >= this.webglProfileDeadline;
        const profilingFrame = this.webglProfile && profileReady && this.webglProfileFrame < 2 + 5;
        this.webglProfileCurrent = profilingFrame ? new Map() : null;
        if (!this.paused) this.simTime += Math.min((now - this.lastTick) / 1000, 0.1) * p.animationSpeed;
        this.lastTick = now;
        const internalResolution: [number, number] = [this.baseTargets[0].width, this.baseTargets[0].height];
        const timer = !profilingFrame && !this.paused && this.timerQuery ? this.gl.createQuery() : null;
        if (timer) this.gl.beginQuery(this.timerQuery!.TIME_ELAPSED_EXT, timer);
        let data = packUniform(internalResolution, this.simTime, this.options.seed, p, 0, this.frame),
            current = 0,
            next = 1;
        this.upload(data);
        this.draw('BASE', this.baseTargets[0], undefined, undefined, undefined, 'base');
        this.draw('MATERIALIZE', targets[next], this.baseTargets[0].texture, undefined, undefined, 'field-materialize');
        [current, next] = [next, current];
        const nextLeadingKey = JSON.stringify(
            this.options.colour.filter((x) => x.type === 'curve' || x.type === 'levels' || x.type === 'hsl'),
        );
        if (nextLeadingKey !== this.leadingKey) {
            this.leadingKey = nextLeadingKey;
            this.cachedLeading = leadingAdjustmentRegion(this.options.colour);
            if (this.adjustmentTexture) this.gl.deleteTexture(this.adjustmentTexture);
            this.adjustmentTexture = undefined;
            this.boundTextures.clear();
        }
        const adjustments = this.cachedLeading;
        if (adjustments.some((x) => !isNeutralAdjustment(x))) {
            const tex =
                this.adjustmentTexture ??
                (this.adjustmentTexture = this.uploadCube(composeAdjustmentLut(adjustments), ADJUSTMENT_LUT_SIZE));
            data.fill(0, 60);
            data.set([0, 0, 0, 1, 1, 1, 1], 60);
            this.upload(data);
            this.draw(
                'LUT',
                this.colourTargets[next],
                this.colourTargets[current].texture,
                undefined,
                tex,
                'colour:adjustments',
            );
            [current, next] = [next, current];
        }
        for (const e of this.options.colour) {
            if (e.type === 'curve' || e.type === 'levels' || e.type === 'hsl' || !e.enabled) continue;
            if (e.type === 'lut') {
                if (!e.assetId || !this.options.lutAssets?.[e.assetId]) continue;
                const a = this.options.lutAssets[e.assetId];
                let tex = this.lutTextures.get(e.assetId);
                if (!tex) {
                    tex = this.uploadCube(cubeRgba16Data(a.data), a.size);
                    this.lutTextures.set(e.assetId, tex);
                }
                data.fill(0, 60);
                data.set([...a.domainMin, ...a.domainMax, e.values[0]], 60);
                this.upload(data);
                this.draw(
                    'LUT',
                    this.colourTargets[next],
                    this.colourTargets[current].texture,
                    undefined,
                    tex,
                    `colour:${e.type}`,
                );
                [current, next] = [next, current];
                continue;
            }
            let values: number[], kind: number;
            if (isRgbColour(e)) {
                if (isNeutralRgb(e)) continue;
                values = [...e.values];
                kind = COLOUR_KIND_INDEX[e.type];
                if (e.type === 'dither') values.push(e.mode === 'bayer' ? 0 : e.mode === 'blue-noise' ? 1 : 2);
                if (e.type === 'tone-mapping')
                    values.push(['none', 'reinhard', 'aces', 'agx', 'custom'].indexOf(e.mode ?? 'none'));
            } else if (e.type === 'colour-grade') {
                values = [
                    p.exposure,
                    p.temperature,
                    p.tint,
                    p.contrast,
                    p.saturation,
                    p.vibrance,
                    p.shadows,
                    p.highlights,
                ];
                kind = 10;
            } else continue;
            data.fill(0, 60);
            data.set(values, 60);
            data[58] = kind;
            this.upload(data);
            this.specialized('COLOUR_EFFECT', kind);
            this.draw(
                `COLOUR_EFFECT:${kind}`,
                this.colourTargets[next],
                this.colourTargets[current].texture,
                undefined,
                undefined,
                `colour:${e.type}`,
            );
            [current, next] = [next, current];
        }
        data = packUniform(internalResolution, this.simTime, this.options.seed, p, 0, this.frame);
        const postValues = POST_PARAMETER_SCHEMA.map((x) => p[x.key]);
        const nextParameterKey = JSON.stringify(postValues);
        if (nextParameterKey !== this.postParameterKey) {
            this.postParameterKey = nextParameterKey;
            this.cachedPostParameters = Float32Array.from(postValues);
        }
        data.set(this.cachedPostParameters, 60);
        const nextPostKey = JSON.stringify([this.options.post, POST_PARAMETER_SCHEMA.map((x) => p[x.key])]);
        if (nextPostKey !== this.postPlanKey) {
            this.postPlanKey = nextPostKey;
            this.cachedPostPlan = rendererStagePlan(this.options.post, p);
        }
        const postStages = this.cachedPostPlan;
        let source: Target = this.colourTargets[current];
        if (postStages.some((e) => e.kind === 'datamosh') && !this.historyValid) {
            this.upload(data);
            this.draw('COPY', this.history!, source.texture, undefined, undefined, 'post:history-copy');
            this.historyValid = true;
        }
        let postRan = false;
        let postIndex = 0;
        for (const e of postStages) {
            if (e.kind === 'datamosh' && !this.historyValid) continue;
            const destination = this.postTargets[postIndex];
            if (e.kind === 'god-rays') {
                data[0] = this.godRays!.width;
                data[1] = this.godRays!.height;
                this.upload(data);
                this.draw('GOD_RAYS', this.godRays!, source.texture, undefined, undefined, `${e.label}:rays`);
                data[0] = internalResolution[0];
                data[1] = internalResolution[1];
                data[58] = 27;
                this.upload(data);
                this.specialized('POST_EFFECT', 27);
                this.draw(
                    'POST_EFFECT:27',
                    destination,
                    source.texture,
                    this.godRays!.texture,
                    undefined,
                    `${e.label}:composite`,
                );
            } else {
                data[58] =
                    e.kind === 'fused-vignette-film-grain'
                        ? 25
                        : e.kind === 'fused-film-grain-vignette'
                          ? 26
                          : POST_KIND_INDEX[e.kind];
                this.upload(data);
                this.specialized('POST_EFFECT', data[58]);
                this.draw(
                    `POST_EFFECT:${data[58]}`,
                    destination,
                    source.texture,
                    this.history?.texture,
                    undefined,
                    e.label,
                );
            }
            source = destination;
            postIndex = 1 - postIndex;
            postRan = true;
        }
        if (postRan && !this.paused) {
            this.copy(source, this.history!, 'post:history-copy');
            this.historyValid = true;
        }
        for (let i = 0; i < OCTAVE_COUNT; i++) {
            data[29] = i;
            if (octaveBlurIsActive(p, i)) {
                const destination = source === this.colourTargets[0] ? this.colourTargets[1] : this.colourTargets[0];
                this.upload(data);
                this.draw('BLUR', destination, source.texture, undefined, undefined, `blur${i}`);
                source = destination;
            }
            if (octaveEffectIsActive(p, i)) {
                const destination = source === this.colourTargets[0] ? this.colourTargets[1] : this.colourTargets[0];
                this.upload(data);
                this.specialized('OCTAVE', i);
                this.draw(`OCTAVE:${i}`, destination, source.texture, undefined, undefined, `octave${i}`);
                source = destination;
            }
        }
        data[0] = this.canvas.width;
        data[1] = this.canvas.height;
        this.upload(data);
        this.draw('PRESENT', null, source.texture, undefined, undefined, 'display');
        if (timer) {
            this.gl.endQuery(this.timerQuery!.TIME_ELAPSED_EXT);
            this.pendingTimerQueries.push({
                query: timer,
                scale: this.adaptive.effectiveScale,
                generation: this.adaptiveGeneration,
            });
        }
        if (!this.paused) {
            this.frame = (this.frame + 1) % 16777216;
        }
        this.finishProfileFrame();
        const sync = profilingFrame ? null : this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync) {
            this.pendingFence = {
                sync,
                submittedAt: performance.now(),
                scale: this.adaptive.effectiveScale,
                generation: this.adaptiveGeneration,
            };
            this.scheduleFencePoll();
        }
        this.gl.flush();
        this.invalid = false;
        this.lastPresented = now;
        this.telemetry.recordRenderedFrame(now);
        const s = this.telemetry.summary(now);
        this.onStats?.(
            s.windows[500]?.fps ?? 0,
            this.canvas.width,
            this.canvas.height,
            s,
            this.adaptive.effectiveScale,
        );
    }
    private copy(from: Target, to: Target, profileLabel?: string) {
        const gl = this.gl;
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, from.framebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, to.framebuffer);
        const started = this.webglProfileCurrent && profileLabel ? performance.now() : 0;
        gl.blitFramebuffer(0, 0, from.width, from.height, 0, 0, to.width, to.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        if (started) {
            gl.finish();
            this.webglProfileCurrent!.set(
                profileLabel!,
                (this.webglProfileCurrent!.get(profileLabel!) ?? 0) + performance.now() - started,
            );
        }
        this.currentFramebuffer = undefined;
    }
    private finishProfileFrame() {
        if (!this.webglProfileCurrent) return;
        if (++this.webglProfileFrame > 2)
            for (const [label, ms] of this.webglProfileCurrent)
                this.webglProfileTotals.set(label, (this.webglProfileTotals.get(label) ?? 0) + ms);
        this.webglProfileCurrent = null;
        if (this.webglProfileFrame !== 2 + 5) return;
        this.webglProfile = false;
        const passes = [...this.webglProfileTotals].map(([label, ms]) => ({ label, ms: ms / 5 }));
        const sum = (test: (label: string) => boolean) =>
            passes.filter((x) => test(x.label)).reduce((n, x) => n + x.ms, 0);
        const fieldMs = sum((x) => x === 'base' || x === 'field-materialize'),
            colourMs = sum((x) => x.startsWith('colour:')),
            postMs = sum((x) => x.startsWith('post:')),
            octavesMs = sum((x) => x.startsWith('blur') || x.startsWith('octave')),
            presentMs = sum((x) => x === 'display');
        this.onGpuStats?.({
            totalMs: fieldMs + colourMs + postMs + octavesMs + presentMs,
            fieldMs,
            colourMs,
            postMs,
            octavesMs,
            presentMs,
            baseMs: fieldMs,
            blurMs: sum((x) => x.startsWith('blur')),
            octaveMs: sum((x) => x.startsWith('octave')),
            displayMs: presentMs,
            passes,
        });
    }
    private resize() {
        const r = this.canvas.getBoundingClientRect(),
            size = renderSize(r.width, r.height, devicePixelRatio, this.options.dprCap),
            w = size.width,
            h = size.height;
        if (w !== this.canvas.width || h !== this.canvas.height) {
            this.canvas.width = w;
            this.canvas.height = h;
            this.recreateTargets();
        }
    }
    private schedule() {
        if (!this.destroyed && !this.raf) this.raf = requestAnimationFrame(this.tick);
    }
    private pollTimerQueries() {
        if (!this.timerQuery || !this.pendingTimerQueries.length) return;
        const gl = this.gl;
        if (gl.getParameter(this.timerQuery.GPU_DISJOINT_EXT)) {
            for (const pending of this.pendingTimerQueries) gl.deleteQuery(pending.query);
            this.pendingTimerQueries = [];
            return;
        }
        while (this.pendingTimerQueries.length) {
            const pending = this.pendingTimerQueries[0];
            if (!gl.getQueryParameter(pending.query, gl.QUERY_RESULT_AVAILABLE)) break;
            this.pendingTimerQueries.shift();
            const elapsedNs = gl.getQueryParameter(pending.query, gl.QUERY_RESULT) as number;
            gl.deleteQuery(pending.query);
            if (pending.generation !== this.adaptiveGeneration) continue;
            const nextScale = this.adaptive.sampleGpu(
                elapsedNs / 1_000_000,
                performance.now(),
                !this.paused && !document.hidden,
                pending.scale,
            );
            if (nextScale !== undefined) this.recreateTargets();
        }
    }
    private scheduleFencePoll() {
        if (this.fencePollTimer === undefined)
            this.fencePollTimer = setTimeout(() => {
                this.fencePollTimer = undefined;
                this.pollFence();
            }, FENCE_POLL_MS);
    }
    private pollFence() {
        const pending = this.pendingFence;
        if (!pending || this.destroyed) return;
        const status = this.gl.clientWaitSync(pending.sync, 0, 0);
        const now = performance.now();
        if (status === this.gl.TIMEOUT_EXPIRED && now - pending.submittedAt < FENCE_EMERGENCY_MS) {
            this.scheduleFencePoll();
            return;
        }
        this.gl.deleteSync(pending.sync);
        this.pendingFence = null;
        if (!this.timerQuery && pending.generation === this.adaptiveGeneration) {
            const nextScale = this.adaptive.sampleGpu(
                now - pending.submittedAt,
                now,
                !this.paused && !document.hidden,
                pending.scale,
            );
            if (nextScale !== undefined) this.recreateTargets();
        }
        this.schedule();
    }
    private tick = (now: number) => {
        this.raf = 0;
        if (this.destroyed) return;
        this.pollTimerQueries();
        if (this.pendingFence) return;
        if ((!this.paused && now - this.lastPresented + 0.5 >= 1000 / 60) || this.invalid) this.render(now);
        if (!this.paused) this.schedule();
    };
    private contextLost = (e: Event) => {
        e.preventDefault();
        this.paused = true;
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.onLost?.('WebGL2 context lost.');
    };
    private contextRestored = () => this.onLost?.('WebGL2 context restored; reload to rebuild graphics resources.');
    setOptions(o: RenderOptions) {
        const resize =
            this.options.renderScale !== o.renderScale ||
            this.options.parameters.godRaysRenderScale !== o.parameters.godRaysRenderScale;
        const scaleChanged = this.options.renderScale !== o.renderScale;
        const resetHistory =
            this.options.seed !== o.seed || (datamoshIsActive(o.parameters) && !this.datamoshWasActive);
        const assets = o.lutAssets ?? {};
        for (const [id, texture] of this.lutTextures)
            if (!assets[id] || assets[id] !== this.options.lutAssets?.[id]) {
                this.gl.deleteTexture(texture);
                this.lutTextures.delete(id);
                this.boundTextures.clear();
            }
        this.options = o;

        if (scaleChanged) this.adaptive.setCeiling(o.renderScale, performance.now());
        this.datamoshWasActive = datamoshIsActive(o.parameters);
        if (resize) this.recreateTargets();
        else if (resetHistory) this.historyValid = false;
        this.invalidate();
    }
    setPaused(v: boolean) {
        if (v === this.paused) return;
        this.paused = v;
        this.lastTick = performance.now();
        this.telemetry.reset();
        this.adaptive.reset(this.lastTick);
        this.adaptiveGeneration += 1;
        // One full-resolution frozen redraw on pause; restore the unchanged adaptive scale on resume.
        this.recreateTargets(v);
        this.invalidate();
    }
    invalidate() {
        this.invalid = true;
        this.schedule();
    }
    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        if (this.raf) cancelAnimationFrame(this.raf);
        if (this.fencePollTimer !== undefined) clearTimeout(this.fencePollTimer);
        if (this.pendingFence) this.gl.deleteSync(this.pendingFence.sync);
        for (const pending of this.pendingTimerQueries) this.gl.deleteQuery(pending.query);
        this.pendingTimerQueries = [];
        this.observer.disconnect();
        this.canvas.removeEventListener('webglcontextlost', this.contextLost);
        this.canvas.removeEventListener('webglcontextrestored', this.contextRestored);
        for (const p of this.programs.values()) this.gl.deleteProgram(p);
        for (const x of this.allTargets()) {
            this.gl.deleteTexture(x.texture);
            this.gl.deleteFramebuffer(x.framebuffer);
        }
        for (const t of this.lutTextures.values()) this.gl.deleteTexture(t);
        this.gl.deleteBuffer(this.uniformBuffer);
        this.gl.deleteVertexArray(this.vao);
    }
}
