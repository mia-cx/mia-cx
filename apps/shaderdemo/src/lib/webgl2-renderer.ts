import type { RenderBackend } from './render-backend';
import {
    COLOUR_KIND_INDEX,
    OCTAVE_COUNT,
    POST_KIND_INDEX,
    POST_PARAMETER_SCHEMA,
    packUniform,
    type RenderOptions,
} from './renderer';
import { composeAdjustmentLut, ADJUSTMENT_LUT_SIZE } from './adjustments';
import { cubeRgba16Data } from './renderer';
import { colourSegments, isNeutralPost } from './pipeline';
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
type Target = { texture: WebGLTexture; framebuffer: WebGLFramebuffer };

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
        fs = compile(gl, gl.FRAGMENT_SHADER, fragment),
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
    private targets: Target[] = [];
    private history?: Target;
    private uniformBuffer: WebGLBuffer;
    private vao: WebGLVertexArrayObject;
    private raf = 0;
    private fence: WebGLSync | null = null;
    private paused = false;
    private destroyed = false;
    private invalid = true;
    private frame = 0;
    private simTime = 0;
    private lastTick = performance.now();
    private lastPresented = 0;
    private historyValid = false;
    private telemetry = new FrameTelemetry();
    private observer: ResizeObserver;
    private lutTextures = new Map<string, WebGLTexture>();
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
    private makeTarget(): Target {
        const gl = this.gl,
            texture = gl.createTexture(),
            framebuffer = gl.createFramebuffer();
        if (!texture || !framebuffer) throw new Error('WebGL2 target allocation failed.');
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA16F,
            this.canvas.width,
            this.canvas.height,
            0,
            gl.RGBA,
            gl.HALF_FLOAT,
            null,
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
            throw new Error('WebGL2 floating-point framebuffer is incomplete.');
        return { texture, framebuffer };
    }
    private recreateTargets() {
        const gl = this.gl;
        for (const x of [...this.targets, ...(this.history ? [this.history] : [])]) {
            gl.deleteTexture(x.texture);
            gl.deleteFramebuffer(x.framebuffer);
        }
        this.targets = [this.makeTarget(), this.makeTarget()];
        this.history = this.makeTarget();
        this.historyValid = false;
    }
    private upload(data: Float32Array) {
        const gl = this.gl;
        gl.bindBuffer(gl.UNIFORM_BUFFER, this.uniformBuffer);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
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
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
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
            const l = gl.getUniformLocation(p, binding);
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
        if (!this.targets.length) return;
        const p = this.options.parameters;
        this.simTime += Math.min((now - this.lastTick) / 1000, 0.1) * p.animationSpeed;
        this.lastTick = now;
        let data = packUniform(
                [this.canvas.width, this.canvas.height],
                this.simTime,
                this.options.seed,
                p,
                0,
                this.frame,
            ),
            current = 0,
            next = 1;
        this.upload(data);
        this.draw('BASE', this.targets[current]);
        this.draw('MATERIALIZE', this.targets[next], this.targets[current].texture);
        [current, next] = [next, current];
        for (const segment of colourSegments(this.options.colour)) {
            if (segment.type === 'scalar') {
                const active = segment.effects.filter((x) => x.enabled);
                if (!active.length) continue;
                const tex = this.uploadCube(composeAdjustmentLut(active), ADJUSTMENT_LUT_SIZE);
                data.fill(0, 60);
                data.set([0, 0, 0, 1, 1, 1, 1], 60);
                this.upload(data);
                this.draw('LUT', this.targets[next], this.targets[current].texture, undefined, tex);
                this.gl.deleteTexture(tex);
                [current, next] = [next, current];
                continue;
            }
            const e = segment.effect;
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
                this.draw('LUT', this.targets[next], this.targets[current].texture, undefined, tex);
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
            } else {
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
            }
            data.fill(0, 60);
            data.set(values, 60);
            data[58] = kind;
            this.upload(data);
            this.draw('COLOUR_EFFECT', this.targets[next], this.targets[current].texture);
            [current, next] = [next, current];
        }
        data = packUniform([this.canvas.width, this.canvas.height], this.simTime, this.options.seed, p, 0, this.frame);
        data.set(
            POST_PARAMETER_SCHEMA.map((x) => p[x.key]),
            60,
        );
        for (const e of this.options.post) {
            if (!e.enabled || isNeutralPost(e.type, p)) continue;
            if (e.type === 'datamosh' && !this.historyValid) {
                this.copy(this.targets[current], this.history!);
                this.historyValid = true;
            }
            data[58] = POST_KIND_INDEX[e.type];
            this.upload(data);
            this.draw('POST_EFFECT', this.targets[next], this.targets[current].texture, this.history?.texture);
            [current, next] = [next, current];
        }
        for (let i = 0; i < OCTAVE_COUNT; i++) {
            data[29] = i;
            const k = i + 1;
            if (p[`octave${k}BlurRadius` as keyof typeof p] > 0) {
                this.upload(data);
                this.draw('BLUR', this.targets[next], this.targets[current].texture);
                [current, next] = [next, current];
            }
            const keys = [
                `octave${k}Pixelate`,
                `octave${k}Noise`,
                `octave${k}Smoothness`,
                `octave${k}Distance`,
                `octave${k}Intensity`,
            ] as (keyof typeof p)[];
            if (keys.some((x) => p[x] !== 0)) {
                this.upload(data);
                this.draw('OCTAVE', this.targets[next], this.targets[current].texture);
                [current, next] = [next, current];
            }
        }
        this.upload(data);
        this.draw('PRESENT', null, this.targets[current].texture);
        if (!this.paused) {
            this.copy(this.targets[current], this.history!);
            this.historyValid = true;
            this.frame = (this.frame + 1) % 16777216;
        }
        this.fence = this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        this.gl.flush();
        this.invalid = false;
        this.lastPresented = now;
        this.telemetry.recordRenderedFrame(now);
        const s = this.telemetry.summary(now);
        this.onStats?.(s.windows[500]?.fps ?? 0, this.canvas.width, this.canvas.height, s, WEBGL2_STARTUP_SCALE);
    }
    private copy(from: Target, to: Target) {
        const gl = this.gl;
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, from.framebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, to.framebuffer);
        gl.blitFramebuffer(
            0,
            0,
            this.canvas.width,
            this.canvas.height,
            0,
            0,
            this.canvas.width,
            this.canvas.height,
            gl.COLOR_BUFFER_BIT,
            gl.NEAREST,
        );
    }
    private resize() {
        const r = this.canvas.getBoundingClientRect(),
            d = Math.min(devicePixelRatio, this.options.dprCap),
            w = Math.max(1, Math.floor(r.width * d * this.options.renderScale)),
            h = Math.max(1, Math.floor(r.height * d * this.options.renderScale));
        if (w !== this.canvas.width || h !== this.canvas.height) {
            this.canvas.width = w;
            this.canvas.height = h;
            this.recreateTargets();
        }
    }
    private schedule() {
        if (!this.destroyed && !this.raf) this.raf = requestAnimationFrame(this.tick);
    }
    private tick = (now: number) => {
        this.raf = 0;
        if (this.destroyed) return;
        if (this.fence) {
            const s = this.gl.clientWaitSync(this.fence, 0, 0);
            if (s === this.gl.TIMEOUT_EXPIRED) {
                this.schedule();
                return;
            }
            this.gl.deleteSync(this.fence);
            this.fence = null;
        }
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
        this.options = o;
        this.invalidate();
    }
    setPaused(v: boolean) {
        this.paused = v;
        this.telemetry.reset();
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
        if (this.fence) this.gl.deleteSync(this.fence);
        this.observer.disconnect();
        this.canvas.removeEventListener('webglcontextlost', this.contextLost);
        this.canvas.removeEventListener('webglcontextrestored', this.contextRestored);
        for (const p of this.programs.values()) this.gl.deleteProgram(p);
        for (const x of [...this.targets, ...(this.history ? [this.history] : [])]) {
            this.gl.deleteTexture(x.texture);
            this.gl.deleteFramebuffer(x.framebuffer);
        }
        for (const t of this.lutTextures.values()) this.gl.deleteTexture(t);
        this.gl.deleteBuffer(this.uniformBuffer);
        this.gl.deleteVertexArray(this.vao);
    }
}
