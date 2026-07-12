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
    private programs = new Map<ProgramName, WebGLProgram>();
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
        for (const name of Object.keys(shader) as ProgramName[]) self.programs.set(name, program(gl, shader[name]));
        gl.bindBuffer(gl.UNIFORM_BUFFER, self.uniformBuffer);
        gl.bufferData(gl.UNIFORM_BUFFER, 180 * 4, gl.DYNAMIC_DRAW);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, self.uniformBuffer);
        for (const p of self.programs.values()) {
            const i = gl.getUniformBlockIndex(p, 'U_block_0Fragment');
            if (i !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, i, 0);
            self.samplerLocations.set(p, [
                gl.getUniformLocation(p, '_group_0_binding_1_fs'),
                gl.getUniformLocation(p, '_group_0_binding_3_fs'),
                gl.getUniformLocation(p, '_group_0_binding_4_fs'),
            ]);
        }
        canvas.addEventListener('webglcontextlost', self.contextLost);
        canvas.addEventListener('webglcontextrestored', self.contextRestored);
        self.observer.observe(canvas);
        self.resize();
        self.onGpuStats?.(null);
        self.render(performance.now());
        self.schedule();
        return self;
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
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
            throw new Error(`WebGL2 ${kind} framebuffer is incomplete.`);
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
        name: ProgramName,
        destination: Target | null,
        source?: WebGLTexture,
        aux?: WebGLTexture,
        cube?: WebGLTexture,
    ) {
        const gl = this.gl,
            p = this.programs.get(name)!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, destination?.framebuffer ?? null);
        gl.viewport(0, 0, destination?.width ?? this.canvas.width, destination?.height ?? this.canvas.height);
        gl.useProgram(p);
        gl.bindVertexArray(this.vao);
        const bind = (
            unit: number,
            tex: WebGLTexture | undefined,
            target: number = gl.TEXTURE_2D,
            binding = unit === 0
                ? '_group_0_binding_1_fs'
                : unit === 1
                  ? '_group_0_binding_3_fs'
                  : '_group_0_binding_4_fs',
        ) => {
            if (!tex) return;
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(target, tex);
            const l = this.samplerLocations.get(p)![binding === '_group_0_binding_4_fs' ? 2 : unit];
            if (l) gl.uniform1i(l, unit);
        };
        bind(0, source);
        bind(1, aux);
        bind(1, cube, gl.TEXTURE_3D);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
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
        return t;
    }
    private render(now: number) {
        const targets = this.colourTargets;
        if (!targets.length) return;
        const p = this.options.parameters;
        if (!this.paused) this.simTime += Math.min((now - this.lastTick) / 1000, 0.1) * p.animationSpeed;
        this.lastTick = now;
        const internalResolution: [number, number] = [this.baseTargets[0].width, this.baseTargets[0].height];
        const timer = !this.paused && this.timerQuery ? this.gl.createQuery() : null;
        if (timer) this.gl.beginQuery(this.timerQuery!.TIME_ELAPSED_EXT, timer);
        let data = packUniform(internalResolution, this.simTime, this.options.seed, p, 0, this.frame),
            current = 0,
            next = 1;
        this.upload(data);
        this.draw('BASE', this.baseTargets[0]);
        this.draw('MATERIALIZE', targets[next], this.baseTargets[0].texture);
        [current, next] = [next, current];
        const adjustments = leadingAdjustmentRegion(this.options.colour);
        if (adjustments.some((x) => !isNeutralAdjustment(x))) {
            const tex =
                this.adjustmentTexture ??
                (this.adjustmentTexture = this.uploadCube(composeAdjustmentLut(adjustments), ADJUSTMENT_LUT_SIZE));
            data.fill(0, 60);
            data.set([0, 0, 0, 1, 1, 1, 1], 60);
            this.upload(data);
            this.draw('LUT', this.colourTargets[next], this.colourTargets[current].texture, undefined, tex);
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
                this.draw('LUT', this.colourTargets[next], this.colourTargets[current].texture, undefined, tex);
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
            this.draw('COLOUR_EFFECT', this.colourTargets[next], this.colourTargets[current].texture);
            [current, next] = [next, current];
        }
        data = packUniform(internalResolution, this.simTime, this.options.seed, p, 0, this.frame);
        data.set(
            POST_PARAMETER_SCHEMA.map((x) => p[x.key]),
            60,
        );
        const postStages = rendererStagePlan(this.options.post, p);
        let source: Target = this.colourTargets[current];
        if (postStages.some((e) => e.kind === 'datamosh') && !this.historyValid) {
            this.upload(data);
            this.draw('COPY', this.history!, source.texture);
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
                this.draw('GOD_RAYS', this.godRays!, source.texture);
                data[0] = internalResolution[0];
                data[1] = internalResolution[1];
                data[58] = 27;
                this.upload(data);
                this.draw('POST_EFFECT', destination, source.texture, this.godRays!.texture);
            } else {
                data[58] =
                    e.kind === 'fused-vignette-film-grain'
                        ? 25
                        : e.kind === 'fused-film-grain-vignette'
                          ? 26
                          : POST_KIND_INDEX[e.kind];
                this.upload(data);
                this.draw('POST_EFFECT', destination, source.texture, this.history?.texture);
            }
            source = destination;
            postIndex = 1 - postIndex;
            postRan = true;
        }
        if (postRan && !this.paused) {
            this.copy(source, this.history!);
            this.historyValid = true;
        }
        for (let i = 0; i < OCTAVE_COUNT; i++) {
            data[29] = i;
            if (octaveBlurIsActive(p, i)) {
                const destination = source === this.colourTargets[0] ? this.colourTargets[1] : this.colourTargets[0];
                this.upload(data);
                this.draw('BLUR', destination, source.texture);
                source = destination;
            }
            if (octaveEffectIsActive(p, i)) {
                const destination = source === this.colourTargets[0] ? this.colourTargets[1] : this.colourTargets[0];
                this.upload(data);
                this.draw('OCTAVE', destination, source.texture);
                source = destination;
            }
        }
        data[0] = this.canvas.width;
        data[1] = this.canvas.height;
        this.upload(data);
        this.draw('PRESENT', null, source.texture);
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
        const sync = this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
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
    private copy(from: Target, to: Target) {
        const gl = this.gl;
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, from.framebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, to.framebuffer);
        gl.blitFramebuffer(0, 0, from.width, from.height, 0, 0, to.width, to.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
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
            }
        this.options = o;
        if (this.adjustmentTexture) this.gl.deleteTexture(this.adjustmentTexture);
        this.adjustmentTexture = undefined;
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
