export const PARAMETER_SCHEMA = [
    { key: 'baseScale', label: 'Base scale', min: 0.45, max: 4, step: 0.01, default: 1.51 },
    { key: 'flowStretch', label: 'Flow stretch', min: 0.35, max: 2.5, step: 0.01, default: 2.5 },
    { key: 'ridgeMix', label: 'Billow / ridge mix', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'ridgeSharpness', label: 'Ridge sharpness', min: 0.4, max: 4, step: 0.01, default: 1.76 },
    { key: 'warpScale', label: 'Warp scale', min: 0.2, max: 2.5, step: 0.01, default: 0.68 },
    { key: 'warpStrength', label: 'Warp strength', min: 0, max: 1.5, step: 0.01, default: 1.5 },
    { key: 'threshold', label: 'Threshold', min: 0.05, max: 0.95, step: 0.01, default: 0.56 },
    { key: 'thresholdSoftness', label: 'Threshold softness', min: 0.01, max: 0.5, step: 0.01, default: 0.5 },
    { key: 'secondaryScale', label: 'Secondary scale', min: 1.1, max: 5, step: 0.01, default: 1.1 },
    { key: 'secondaryMix', label: 'Secondary mix', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'finalContrast', label: 'Final contrast', min: 0.2, max: 3, step: 0.01, default: 1.54 },
    { key: 'animationSpeed', label: 'Animation speed', min: 0, max: 3, step: 0.01, default: 0.6 },
    { key: 'centerDarkness', label: 'Center darkness', min: 0, max: 1.5, step: 0.01, default: 0.65 },
    { key: 'centerWidth', label: 'Center width', min: 0.1, max: 2.5, step: 0.01, default: 0.83 },
    { key: 'centerHeight', label: 'Center height', min: 0.1, max: 2.5, step: 0.01, default: 0.83 },
    { key: 'centerRoundness', label: 'Center roundness', min: 2, max: 12, step: 0.1, default: 4 },
    { key: 'centerSoftness', label: 'Center softness', min: 0.01, max: 1.5, step: 0.01, default: 1.5 },
] as const;
export type ParameterKey = (typeof PARAMETER_SCHEMA)[number]['key'];
export type ShaderParameters = Record<ParameterKey, number>;
export const defaultParameters = (): ShaderParameters =>
    Object.fromEntries(PARAMETER_SCHEMA.map(({ key, default: value }) => [key, value])) as ShaderParameters;

export interface RenderOptions {
    seed: number;
    dprCap: number;
    renderScale: number;
    parameters: ShaderParameters;
}

export function renderSize(width: number, height: number, dpr: number, cap: number) {
    return {
        width: Math.max(1, Math.floor(width * Math.min(dpr, cap))),
        height: Math.max(1, Math.floor(height * Math.min(dpr, cap))),
    };
}

export function scaledSize(width: number, height: number, scale: number) {
    return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

export function advanceSimulationTime(time: number, deltaSeconds: number, speed: number) {
    return time + deltaSeconds * speed;
}

const common = /* wgsl */ `
struct U {
 resolution: vec2f, time: f32, seed: f32,
 baseScale: f32, flowStretch: f32, ridgeMix: f32, ridgeSharpness: f32,
 warpScale: f32, warpStrength: f32, threshold: f32, thresholdSoftness: f32,
 secondaryScale: f32, secondaryMix: f32, finalContrast: f32, animationSpeed: f32,
 centerDarkness: f32, centerWidth: f32, centerHeight: f32, centerRoundness: f32,
 centerSoftness: f32, pad1: f32, pad2: f32
};
@group(0) @binding(0) var<uniform> u: U;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
    let p = array(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3)); return vec4f(p[i],0,1);
}
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p,vec2f(127.1,311.7)) + u.seed*19.19)*43758.5453); }
fn noise(p: vec2f) -> f32 {
    let i=floor(p); let f=fract(p); let s=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2f(1,0)),s.x),mix(hash(i+vec2f(0,1)),hash(i+vec2f(1)),s.x),s.y);
}
fn n2(p: vec2f) -> vec2f { return vec2f(noise(p),noise(p+vec2f(17.7,43.2))); }
fn hash3(p: vec3f) -> f32 { return fract(sin(dot(p,vec3f(127.1,311.7,74.7)) + u.seed*19.19)*43758.5453); }
fn noise3(p: vec3f) -> f32 {
    let i=floor(p); let f=fract(p); let s=f*f*(3.-2.*f);
    let z0=mix(mix(hash3(i),hash3(i+vec3f(1,0,0)),s.x),mix(hash3(i+vec3f(0,1,0)),hash3(i+vec3f(1,1,0)),s.x),s.y);
    let z1=mix(mix(hash3(i+vec3f(0,0,1)),hash3(i+vec3f(1,0,1)),s.x),mix(hash3(i+vec3f(0,1,1)),hash3(i+vec3f(1,1,1)),s.x),s.y);
    return mix(z0,z1,s.z);
}
fn noise3v(p: vec2f, z: f32) -> vec2f {
    return vec2f(noise3(vec3f(p,z)),noise3(vec3f(p+vec2f(17.7,43.2),z+11.3)));
}
`;

const baseShader =
    common +
    /* wgsl */ `
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    var q=(pos.xy/u.resolution)*2.-1.; q.x*=u.resolution.x/u.resolution.y;
    let t=u.time;
    let flow=mat2x2f(.89,.45,-.45,.89)*vec2f(q.x,q.y*u.flowStretch);
    let drift=noise3v(flow*u.warpScale,t*.11)-.5;
    let p=(flow+drift*u.warpStrength)*u.baseScale;
    let primary=noise3(vec3f(p,t*.075));
    let secondary=noise3(vec3f(p*u.secondaryScale+vec2f(13.7,-8.4)-drift*.41,t*.12+7.1));
    let tertiary=noise3(vec3f(p*u.secondaryScale*1.85+vec2f(-4.1,19.3)+drift*.23,t*.18+19.7));
    let billow=1.-abs(primary*2.-1.);
    let ridged=pow(clamp(billow,0.,1.),u.ridgeSharpness);
    let shaped=mix(primary,ridged,u.ridgeMix);
    var natural=shaped+(secondary-.5)*u.secondaryMix+(tertiary-.5)*u.secondaryMix*.35;
    let centerPoint=abs(q/vec2f(u.centerWidth,u.centerHeight));
    let centerDistance=pow(pow(centerPoint.x,u.centerRoundness)+pow(centerPoint.y,u.centerRoundness),1./u.centerRoundness);
    let centerFeather=u.centerSoftness*.5;
    let center=1.-smoothstep(1.-centerFeather,1.+centerFeather,centerDistance);
    let centerAttenuation=exp2(-center*u.centerDarkness*4.);
    natural*=centerAttenuation;
    let thresholdWidth=max(u.thresholdSoftness,fwidth(natural)*1.5);
    var f=smoothstep(u.threshold-thresholdWidth,u.threshold+thresholdWidth,natural);
    return vec4f(vec3f(f),1.);
}`;

const displayShader =
    common +
    /* wgsl */ `
@group(0) @binding(1) var src: texture_2d<f32>; @group(0) @binding(2) var samp: sampler;
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let uv=pos.xy/u.resolution;
    let f=pow(clamp(textureSample(src,samp,uv).r,0.,1.),u.finalContrast);
    return vec4f(vec3f(f),1.);
}`;

export class AtmosphereRenderer {
    private device?: GPUDevice;
    private context: GPUCanvasContext | null = null;
    private pipelines: GPURenderPipeline[] = [];
    private textures: GPUTexture[] = [];
    private sampler?: GPUSampler;
    private buffers: GPUBuffer[] = [];
    private observer: ResizeObserver;
    private rafId = 0;
    private simTime = 0;
    private lastTime = performance.now();
    private destroyed = false;
    private invalid = true;
    paused = false;
    onStats?: (fps: number, width: number, height: number) => void;
    onLost?: (message: string) => void;

    private constructor(
        private canvas: HTMLCanvasElement,
        public options: RenderOptions,
    ) {
        this.observer = new ResizeObserver(() => {
            this.resize();
            this.invalidate();
        });
    }

    static async create(canvas: HTMLCanvasElement, options: RenderOptions) {
        if (!navigator.gpu) throw new Error('WebGPU is not available in this browser.');
        const self = new AtmosphereRenderer(canvas, options);
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) throw new Error('No compatible WebGPU adapter was found.');
        self.device = await adapter.requestDevice();
        self.context = canvas.getContext('webgpu');
        if (!self.context) throw new Error('Could not create a WebGPU canvas context.');
        const format = navigator.gpu.getPreferredCanvasFormat();
        self.context.configure({ device: self.device, format, alphaMode: 'opaque' });
        const make = async (code: string, target: GPUTextureFormat) => {
            const module = self.device!.createShaderModule({ code });
            const info = await module.getCompilationInfo();
            const errors = info.messages.filter((message) => message.type === 'error');
            if (errors.length) throw new Error(errors.map((message) => message.message).join('\n'));
            return self.device!.createRenderPipeline({
                layout: 'auto',
                vertex: { module, entryPoint: 'vs' },
                fragment: { module, entryPoint: 'fs', targets: [{ format: target }] },
            });
        };
        self.pipelines = await Promise.all([make(baseShader, 'r16float'), make(displayShader, format)]);
        self.buffers = Array.from({ length: 2 }, () =>
            self.device!.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
        );
        self.sampler = self.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
        self.device.lost.then((info) => {
            if (!self.destroyed) self.onLost?.(`GPU device lost: ${info.message || info.reason}`);
        });
        self.observer.observe(canvas);
        self.resize();
        self.schedule();
        return self;
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const size = renderSize(rect.width, rect.height, devicePixelRatio, this.options.dprCap);
        if (this.canvas.width !== size.width || this.canvas.height !== size.height) {
            this.canvas.width = size.width;
            this.canvas.height = size.height;
            this.recreateTargets();
        }
    }
    private recreateTargets() {
        if (!this.device) return;
        this.textures.forEach((texture) => texture.destroy());
        const base = scaledSize(this.canvas.width, this.canvas.height, this.options.renderScale);
        const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
        this.textures = [this.device.createTexture({ size: [base.width, base.height], format: 'r16float', usage })];
    }
    setOptions(options: RenderOptions) {
        const changed = this.options.renderScale !== options.renderScale;
        this.options = options;
        if (changed) this.recreateTargets();
        this.invalidate();
    }
    setPaused(value: boolean) {
        this.paused = value;
        this.lastTime = performance.now();
        this.invalidate();
    }
    invalidate() {
        this.invalid = true;
        this.schedule();
    }
    private schedule() {
        if (!this.destroyed && !this.rafId) this.rafId = requestAnimationFrame(this.tick);
    }
    private tick = (now: number) => {
        this.rafId = 0;
        if (this.destroyed) return;
        const animated = !this.paused;
        const dt = Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000));
        this.lastTime = now;
        if (animated) this.simTime = advanceSimulationTime(this.simTime, dt, this.options.parameters.animationSpeed);
        if (this.invalid || animated) {
            this.render();
            this.invalid = false;
            this.onStats?.(dt > 0 ? 1 / dt : 0, this.canvas.width, this.canvas.height);
        }
        if (animated) this.schedule();
    };
    private render() {
        const d = this.device,
            c = this.context,
            buffers = this.buffers,
            s = this.sampler;
        if (!d || !c || buffers.length < 2 || !s || this.pipelines.length < 2 || this.textures.length < 1) return;
        const enc = d.createCommandEncoder();
        // 21 floats padded to 24 (96 bytes) to satisfy WGSL's 16-byte uniform size alignment.
        const data = new Float32Array(24);
        let passIndex = 0;
        const draw = (target: GPUTextureView, pipeline: GPURenderPipeline, source?: GPUTexture) => {
            const buffer = buffers[passIndex++];
            d.queue.writeBuffer(buffer, 0, data);
            const entries: GPUBindGroupEntry[] = [{ binding: 0, resource: { buffer } }];
            if (source) {
                entries.push({ binding: 1, resource: source.createView() }, { binding: 2, resource: s });
            }
            const pass = enc.beginRenderPass({
                colorAttachments: [
                    { view: target, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } },
                ],
            });
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, d.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries }));
            pass.draw(3);
            pass.end();
        };
        data.set([
            this.textures[0].width,
            this.textures[0].height,
            this.simTime,
            this.options.seed,
            ...PARAMETER_SCHEMA.map(({ key }) => this.options.parameters[key]),
        ]);
        draw(this.textures[0].createView(), this.pipelines[0]);
        data[0] = this.canvas.width;
        data[1] = this.canvas.height;
        draw(c.getCurrentTexture().createView(), this.pipelines[1], this.textures[0]);
        d.queue.submit([enc.finish()]);
    }
    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.observer.disconnect();
        this.textures.forEach((texture) => texture.destroy());
        this.buffers.forEach((buffer) => buffer.destroy());
        this.buffers = [];
        try {
            this.context?.unconfigure();
        } catch {}
        this.device?.destroy();
    }
    stop() {
        this.destroy();
    }
}
