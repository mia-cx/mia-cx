export const STAGES = ['base', 'octave1', 'octave2', 'octave3', 'animation'] as const;
export type Stage = (typeof STAGES)[number];

export const PARAMETER_SCHEMA = [
    { key: 'baseScale', label: 'Blob size', min: 0.45, max: 2.5, step: 0.01, default: 1.42 },
    { key: 'ribbonFrequency', label: 'Ribbon frequency', min: 0.2, max: 4, step: 0.01, default: 1.42 },
    { key: 'ribbonAmplitude', label: 'Ribbon amplitude', min: 0, max: 0.8, step: 0.01, default: 0.25 },
    { key: 'ribbonWidth', label: 'Ribbon width', min: 0.4, max: 4, step: 0.01, default: 1.68 },
    { key: 'warpScale', label: 'Warp scale', min: 0.2, max: 2.5, step: 0.01, default: 0.78 },
    { key: 'warpStrength', label: 'Warp strength', min: 0, max: 1.5, step: 0.01, default: 0.62 },
    { key: 'massThreshold', label: 'Mass threshold', min: 0.05, max: 0.9, step: 0.01, default: 0.43 },
    { key: 'massSoftness', label: 'Mass softness', min: 0.02, max: 0.5, step: 0.01, default: 0.29 },
    { key: 'voidScale', label: 'Void scale', min: 0.2, max: 2.5, step: 0.01, default: 0.96 },
    { key: 'voidStrength', label: 'Void strength', min: 0, max: 1.2, step: 0.01, default: 0.55 },
    { key: 'lacunarity', label: 'Octave frequency', min: 1.2, max: 3.5, step: 0.01, default: 2 },
    { key: 'persistence', label: 'Octave strength', min: 0, max: 0.9, step: 0.01, default: 0.42 },
    { key: 'edgeConcentration', label: 'Edge concentration', min: 0.2, max: 5, step: 0.01, default: 1.7 },
    { key: 'recursiveMix', label: 'Recursive mix', min: 0, max: 1, step: 0.01, default: 0.63 },
    { key: 'finalSoftness', label: 'Final softness', min: 0, max: 1, step: 0.01, default: 0.58 },
    { key: 'finalContrast', label: 'Final contrast', min: 0.2, max: 3, step: 0.01, default: 1.08 },
    { key: 'animationSpeed', label: 'Animation speed', min: 0, max: 3, step: 0.01, default: 1 },
] as const;
export type ParameterKey = (typeof PARAMETER_SCHEMA)[number]['key'];
export type ShaderParameters = Record<ParameterKey, number>;
export const defaultParameters = (): ShaderParameters =>
    Object.fromEntries(PARAMETER_SCHEMA.map(({ key, default: value }) => [key, value])) as ShaderParameters;

export interface RenderOptions {
    stages: Record<Stage, boolean>;
    seed: number;
    dprCap: number;
    renderScale: number;
    parameters: ShaderParameters;
}

export const defaultStages = (): Record<Stage, boolean> =>
    Object.fromEntries(STAGES.map((stage) => [stage, true])) as Record<Stage, boolean>;

export function renderSize(width: number, height: number, dpr: number, cap: number) {
    return {
        width: Math.max(1, Math.floor(width * Math.min(dpr, cap))),
        height: Math.max(1, Math.floor(height * Math.min(dpr, cap))),
    };
}

export function scaledSize(width: number, height: number, scale: number) {
    return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

const common = /* wgsl */ `
struct U {
 resolution: vec2f, time: f32, seed: f32, stage: f32, enabled: f32, sourceScale: f32, pad: f32,
 baseScale: f32, ribbonFrequency: f32, ribbonAmplitude: f32, ribbonWidth: f32,
 warpScale: f32, warpStrength: f32, massThreshold: f32, massSoftness: f32,
 voidScale: f32, voidStrength: f32, lacunarity: f32, persistence: f32,
 edgeConcentration: f32, recursiveMix: f32, finalSoftness: f32, finalContrast: f32,
 animationSpeed: f32, pad1: f32, pad2: f32, pad3: f32
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
`;

const baseShader =
    common +
    /* wgsl */ `
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    var q=(pos.xy/u.resolution)*2.-1.; q.x*=u.resolution.x/u.resolution.y;
    let t=u.time*u.animationSpeed;
    let bend=u.ribbonAmplitude*sin(q.x*u.ribbonFrequency + sin(t*.041)*1.8) + u.ribbonAmplitude*.68*sin(q.x*u.ribbonFrequency*2.-t*.027);
    let ribbon=exp(-pow(abs(q.y-bend)*u.ribbonWidth,2.4));
    let drift=n2(q*u.warpScale+vec2f(sin(t*.019),cos(t*.023))*.17)-.5;
    let masses=noise((q+drift*u.warpStrength)*u.baseScale+vec2f(cos(t*.017),sin(t*.014))*.23);
    let voids=noise(q*u.voidScale+vec2f(9.2,-4.7)-drift*u.warpStrength*.52);
    var f=.62*ribbon+.72*smoothstep(u.massThreshold,u.massThreshold+u.massSoftness,masses)-u.voidStrength*smoothstep(.52,.78,voids);
    f=smoothstep(.16,.88,f);
    if(u.enabled<.5){f=.14;}
    return vec4f(vec3f(f),1.);
}`;

const octaveShader =
    common +
    /* wgsl */ `
@group(0) @binding(1) var src: texture_2d<f32>; @group(0) @binding(2) var samp: sampler;
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let uv=pos.xy/u.resolution; var q=uv*2.-1.; q.x*=u.resolution.x/u.resolution.y;
    let old=textureSample(src,samp,uv).r;
    if(u.enabled<.5){return vec4f(vec3f(old),1.);}
    let k=pow(u.lacunarity,u.stage); let rate=(.031+.013*u.stage)*u.animationSpeed;
    let wobble=n2(q*(.72*k)+vec2f(sin(u.time*rate),cos(u.time*rate*.73))*.21)-.5;
    let detail=noise((q+wobble*(.34/k))*k*1.65+vec2f(u.stage*13.1,u.seed*.07));
    let transition=pow(clamp(1.-abs(old-.5)*2.,0.,1.),u.edgeConcentration);
    let signed=(detail-.5)*(u.persistence/(1.+u.stage*.34))*transition;
    let nested=smoothstep(.34,.66,old+signed);
    let soft=mix(old,nested,u.recursiveMix);
    return vec4f(vec3f(soft),1.);
}`;

const displayShader =
    common +
    /* wgsl */ `
@group(0) @binding(1) var src: texture_2d<f32>; @group(0) @binding(2) var samp: sampler;
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let uv=pos.xy/u.resolution; let px=1./u.resolution;
    let side=u.finalSoftness*.25;
    var f=textureSample(src,samp,uv).r*(1.-u.finalSoftness);
    f+=textureSample(src,samp,uv+vec2f(px.x,0)).r*side;
    f+=textureSample(src,samp,uv-vec2f(px.x,0)).r*side;
    f+=textureSample(src,samp,uv+vec2f(0,px.y)).r*side;
    f+=textureSample(src,samp,uv-vec2f(0,px.y)).r*side;
    f=pow(clamp(f,0.,1.),u.finalContrast);
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
        self.pipelines = await Promise.all([
            make(baseShader, 'r16float'),
            make(octaveShader, 'r16float'),
            make(displayShader, format),
        ]);
        self.buffers = Array.from({ length: 5 }, () =>
            self.device!.createBuffer({ size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
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
        const scales = [0.18, 0.32, 0.55, 0.78];
        const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
        this.textures = scales.map((scale) =>
            this.device!.createTexture({
                size: [Math.max(1, Math.floor(base.width * scale)), Math.max(1, Math.floor(base.height * scale))],
                format: 'r16float',
                usage,
            }),
        );
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
        const animated = !this.paused && this.options.stages.animation;
        const dt = Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000));
        this.lastTime = now;
        if (animated) this.simTime += dt;
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
        if (!d || !c || buffers.length < 5 || !s || this.pipelines.length < 3 || this.textures.length < 4) return;
        const enc = d.createCommandEncoder();
        const data = new Float32Array(28);
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
            0,
            this.options.stages.base ? 1 : 0,
            1,
            0,
            ...PARAMETER_SCHEMA.map(({ key }) => this.options.parameters[key]),
            0,
            0,
            0,
        ]);
        draw(this.textures[0].createView(), this.pipelines[0]);
        for (let i = 1; i < 4; i++) {
            data[0] = this.textures[i].width;
            data[1] = this.textures[i].height;
            data[4] = i;
            data[5] = this.options.stages[`octave${i}` as Stage] ? 1 : 0;
            draw(this.textures[i].createView(), this.pipelines[1], this.textures[i - 1]);
        }
        data[0] = this.canvas.width;
        data[1] = this.canvas.height;
        draw(c.getCurrentTexture().createView(), this.pipelines[2], this.textures[3]);
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
