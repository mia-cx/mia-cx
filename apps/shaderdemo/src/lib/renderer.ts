export const STAGES = [
    'metablobs',
    'warp',
    'octaves',
    'edges',
    'color',
    'duplicate',
    'bloom',
    'chromatic',
    'grain',
    'animation',
] as const;
export type Stage = (typeof STAGES)[number];
export type DebugView = 'final' | 'field' | 'edges' | 'duplicate' | 'bloom-source';
export type BlendMode = 'screen' | 'add' | 'soft-light';
export interface RenderOptions {
    stages: Record<Stage, boolean>;
    debug: DebugView;
    blend: BlendMode;
    seed: number;
    speed: number;
    dprCap: number;
    renderScale: number;
    warp: number;
    detail: number;
    colorIntensity: number;
    duplicateOpacity: number;
    duplicateRotation: number;
    duplicateScale: number;
    bloomIntensity: number;
    bloomRadius: number;
    chromaticAmount: number;
}
export const defaultStages = (): Record<Stage, boolean> =>
    Object.fromEntries(STAGES.map((s) => [s, true])) as Record<Stage, boolean>;
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
struct U { v: array<vec4f,8> }; @group(0) @binding(0) var<uniform> u: U;
@vertex fn vs(@builtin(vertex_index)i:u32)->@builtin(position) vec4f { let p=array(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3)); return vec4f(p[i],0,1); }
fn hash(p:vec2f)->f32{return fract(sin(dot(p,vec2f(127.1,311.7))+u.v[0].w*17.13)*43758.5453);}
fn noise(p:vec2f)->f32{let i=floor(p);let f=fract(p);let a=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2f(1,0)),a.x),mix(hash(i+vec2f(0,1)),hash(i+vec2f(1)),a.x),a.y);}
fn fbm(q:vec2f)->f32{var p=q;var n=0.;var a=.52;for(var i=0;i<6;i++){n+=a*noise(p);p=mat2x2f(1.55,1.18,-1.18,1.55)*p+2.7;a*=.48;}return n;}
`;
const sceneShader =
    common +
    /* wgsl */ `
fn field(q0:vec2f,t:f32)->vec3f{var q=q0;let warp=u.v[4].x*u.v[1].y;if(warp>0.){let w=vec2f(fbm(q*1.1+t*.018),fbm(q*1.1+11.-t*.015))-.5;q+=w*warp;}
 let broad=fbm(q*.48+vec2f(t*.008,-t*.006));let ridge=1.-abs(2.*fbm(q*1.7+vec2f(broad*1.8))-1.);let warped=fbm(q*3.1+vec2f(ridge,broad)*2.2);var f=smoothstep(.3,.78,broad*.72+ridge*.38+warped*.18);
 if(u.v[1].x>0.){let b=max(exp(-length((q-vec2f(-.55,.15))*vec2f(.55,1.2))*1.5),exp(-length((q-vec2f(.62,-.25))*vec2f(.7,1.1))*1.7));f=mix(f,max(f,b),.35);} if(u.v[1].z>0.){f+=(fbm(q*(4.+u.v[4].y*5.))-.5)*.18*u.v[4].y;}
 let e=pow(max(0.,1.-abs(f-.5)*7.),1.7);if(u.v[1].w>0.){f+=(noise(q*35.)-.5)*e*.16;}return vec3f(clamp(f,0.,1.2),e,broad);}
fn palette(x:f32,e:f32)->vec3f{var c=mix(vec3f(.004,.006,.035),vec3f(.025,.22,.48),smoothstep(.2,.48,x));c=mix(c,vec3f(.08,.92,.85),smoothstep(.46,.65,x));c=mix(c,vec3f(1.,.11,.55),smoothstep(.62,.82,x));c=mix(c,vec3f(.72,.4,1.),smoothstep(.76,.95,x));return c+e*vec3f(.05,.16,.22);}
fn layer(q:vec2f,t:f32)->vec4f{let a=field(q,t);let colored=palette(a.x,a.y);let c=mix(vec3f(a.x),colored,u.v[4].z*u.v[2].x);return vec4f(c,a.x);}
@fragment fn fs(@builtin(position)p:vec4f)->@location(0) vec4f{var q=(p.xy/u.v[0].xy)*2.-1.;q.x*=u.v[0].x/u.v[0].y;let t=u.v[0].z;let a=field(q,t);var c=mix(vec3f(a.x),palette(a.x,a.y),u.v[4].z*u.v[2].x);var d=vec3f(0.);
 if(u.v[2].y>0.){let ang=u.v[5].y;let m=mat2x2f(cos(ang),sin(ang),-sin(ang),cos(ang))*u.v[5].z;let b=field(m*q+vec2f(.2,-.12),-t*.7+8.);d=mix(vec3f(b.x),palette(b.x,b.y),u.v[4].z*u.v[2].x)*smoothstep(.25,.75,b.x);let op=u.v[5].x;if(u.v[7].y<.5){c=1.-(1.-c)*(1.-d*op);}else if(u.v[7].y<1.5){c+=d*op;}else{c=mix(c,2.*c*d+c*c*(1.-2.*d),op);}}
 let debug=u.v[7].x;if(debug>.5&&debug<1.5){c=vec3f(a.x);}else if(debug<2.5&&debug>1.5){c=vec3f(a.y);}else if(debug>2.5&&debug<3.5){c=d;}return vec4f(max(c,vec3f(0.)),1.);}`;
const blurShader =
    common +
    /* wgsl */ `
@group(0) @binding(1) var src:texture_2d<f32>;@group(0) @binding(2)var samp:sampler;
@fragment fn fs(@builtin(position)p:vec4f)->@location(0)vec4f{let uv=p.xy/u.v[0].xy;let axis=u.v[6].zw/u.v[0].xy;let r=u.v[6].y;var c=textureSample(src,samp,uv)*.227;for(var i=1;i<=4;i++){let x=f32(i)*r*.75;c+=(textureSample(src,samp,uv+axis*x)+textureSample(src,samp,uv-axis*x))*(.195/f32(i));}return vec4f(max(c.rgb-.35,vec3f(0.)),1.);}`;
const compositeShader =
    common +
    /* wgsl */ `
@group(0) @binding(1)var sceneTex:texture_2d<f32>;@group(0) @binding(2)var bloomTex:texture_2d<f32>;@group(0) @binding(3)var samp:sampler;
@fragment fn fs(@builtin(position)p:vec4f)->@location(0)vec4f{let uv=p.xy/u.v[0].xy;let px=vec2f(u.v[6].x/u.v[0].x,0.);var c=textureSample(sceneTex,samp,uv).rgb;if(u.v[2].w>0.){c.r=textureSample(sceneTex,samp,uv+px).r;c.b=textureSample(sceneTex,samp,uv-px).b;}let b=textureSample(bloomTex,samp,uv).rgb;if(u.v[7].x>3.5){c=b;}else if(u.v[2].z>0.){c+=b*u.v[5].w;}if(u.v[3].x>0.){c+=(hash(p.xy+fract(u.v[0].z)*91.)-.5)/255.*5.;}c=max(c,vec3f(0.));c=pow(c/(1.+c),vec3f(.82));return vec4f(c,1.);}`;

export class AtmosphereRenderer {
    private device?: GPUDevice;
    private context: GPUCanvasContext | null = null;
    private buffers: GPUBuffer[] = [];
    private scenePipeline?: GPURenderPipeline;
    private blurPipeline?: GPURenderPipeline;
    private compositePipeline?: GPURenderPipeline;
    private sceneTex?: GPUTexture;
    private blurA?: GPUTexture;
    private blurB?: GPUTexture;
    private sampler?: GPUSampler;
    private observer: ResizeObserver;
    private rafId = 0;
    private frameCount = 0;
    private simTime = 0;
    private lastTime = performance.now();
    private samples: number[] = [];
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
        if (!navigator.gpu)
            throw new Error('WebGPU is not available in this browser. Try a current Chrome, Edge, or Firefox Nightly.');
        const self = new AtmosphereRenderer(canvas, options);
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) throw new Error('No compatible WebGPU adapter was found.');
        self.device = await adapter.requestDevice();
        if (self.destroyed) {
            self.device.destroy();
            throw new Error('Renderer initialization cancelled.');
        }
        self.context = canvas.getContext('webgpu');
        if (!self.context) throw new Error('Could not create a WebGPU canvas context.');
        const format = navigator.gpu.getPreferredCanvasFormat();
        self.context.configure({ device: self.device, format, alphaMode: 'opaque' });
        const make = async (code: string, target: GPUTextureFormat) => {
            const m = self.device!.createShaderModule({ code });
            const info = await m.getCompilationInfo();
            const errors = info.messages.filter((x) => x.type === 'error');
            if (errors.length) throw new Error(errors.map((x) => x.message).join('\n'));
            return self.device!.createRenderPipeline({
                layout: 'auto',
                vertex: { module: m, entryPoint: 'vs' },
                fragment: { module: m, entryPoint: 'fs', targets: [{ format: target }] },
                primitive: { topology: 'triangle-list' },
            });
        };
        [self.scenePipeline, self.blurPipeline, self.compositePipeline] = await Promise.all([
            make(sceneShader, 'rgba16float'),
            make(blurShader, 'rgba16float'),
            make(compositeShader, format),
        ]);
        self.buffers = Array.from({ length: 4 }, () =>
            self.device!.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
        );
        self.sampler = self.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
        self.device.lost.then((i) => {
            if (!self.destroyed) {
                self.destroy();
                self.onLost?.(`GPU device lost: ${i.message || i.reason}`);
            }
        });
        self.observer.observe(canvas);
        self.resize();
        self.lastTime = performance.now();
        self.schedule();
        return self;
    }
    resize() {
        const r = this.canvas.getBoundingClientRect();
        const s = renderSize(r.width, r.height, devicePixelRatio, this.options.dprCap);
        if (this.canvas.width !== s.width || this.canvas.height !== s.height) {
            this.canvas.width = s.width;
            this.canvas.height = s.height;
            this.recreateTargets();
        }
    }
    private recreateTargets() {
        if (!this.device) return;
        this.sceneTex?.destroy();
        this.blurA?.destroy();
        this.blurB?.destroy();
        const s = scaledSize(this.canvas.width, this.canvas.height, this.options.renderScale),
            b = scaledSize(s.width, s.height, 0.25);
        const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
        this.sceneTex = this.device.createTexture({ size: [s.width, s.height], format: 'rgba16float', usage });
        this.blurA = this.device.createTexture({ size: [b.width, b.height], format: 'rgba16float', usage });
        this.blurB = this.device.createTexture({ size: [b.width, b.height], format: 'rgba16float', usage });
    }
    setOptions(o: RenderOptions) {
        this.options = o;
        const expected = scaledSize(this.canvas.width, this.canvas.height, o.renderScale);
        if (this.sceneTex && (this.sceneTex.width !== expected.width || this.sceneTex.height !== expected.height))
            this.recreateTargets();
        this.invalidate();
    }
    setPaused(v: boolean) {
        this.paused = v;
        this.lastTime = performance.now();
        this.samples = [];
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
        const animated = !this.paused && this.options.stages.animation && this.options.speed > 0;
        const dt = Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000));
        this.lastTime = now;
        if (animated) this.simTime += dt * this.options.speed;
        if (this.invalid || animated) {
            this.render();
            this.invalid = false;
            this.samples.push(Math.max(1, dt * 1000));
            if (this.samples.length > 30) this.samples.shift();
            this.frameCount++;
            if (this.frameCount % 15 === 0)
                this.onStats?.(
                    1000 / (this.samples.reduce((a, b) => a + b, 0) / this.samples.length),
                    this.canvas.width,
                    this.canvas.height,
                );
        }
        if (animated) this.schedule();
    };
    private render() {
        const d = this.device,
            cx = this.context,
            sp = this.scenePipeline,
            bp = this.blurPipeline,
            cp = this.compositePipeline,
            st = this.sceneTex,
            a = this.blurA,
            b = this.blurB,
            bufs = this.buffers,
            samp = this.sampler;
        if (!d || !cx || !sp || !bp || !cp || !st || !a || !b || bufs.length < 4 || !samp) return;
        const o = this.options,
            s = o.stages,
            ss = { width: st.width, height: st.height },
            bs = { width: a.width, height: a.height };
        const debug = ['final', 'field', 'edges', 'duplicate', 'bloom-source'].indexOf(o.debug),
            blend = ['screen', 'add', 'soft-light'].indexOf(o.blend);
        const data = new Float32Array(32);
        data.set(
            [
                ss.width,
                ss.height,
                this.simTime,
                o.seed,
                ...STAGES.map((x) => (s[x] ? 1 : 0)),
                o.warp,
                o.detail,
                o.colorIntensity,
                o.renderScale,
                o.duplicateOpacity,
                o.duplicateRotation,
                o.duplicateScale,
                o.bloomIntensity,
                o.chromaticAmount,
                o.bloomRadius,
                1,
                0,
                debug,
                blend,
            ],
            0,
        );
        d.queue.writeBuffer(bufs[0], 0, data);
        const enc = d.createCommandEncoder();
        const pass = (view: GPUTextureView, p: GPURenderPipeline, bind: GPUBindGroup) => {
            const x = enc.beginRenderPass({
                colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
            });
            x.setPipeline(p);
            x.setBindGroup(0, bind);
            x.draw(3);
            x.end();
        };
        const bg = (p: GPURenderPipeline, buffer: GPUBuffer, entries: GPUBindGroupEntry[]) =>
            d.createBindGroup({
                layout: p.getBindGroupLayout(0),
                entries: [{ binding: 0, resource: { buffer } }, ...entries],
            });
        pass(st.createView(), sp, bg(sp, bufs[0], []));
        data[24] = bs.width;
        data[25] = bs.height;
        data[28] = 1;
        data[29] = 0;
        d.queue.writeBuffer(bufs[1], 0, data);
        pass(
            a.createView(),
            bp,
            bg(bp, bufs[1], [
                { binding: 1, resource: st.createView() },
                { binding: 2, resource: samp },
            ]),
        );
        data[28] = 0;
        data[29] = 1;
        d.queue.writeBuffer(bufs[2], 0, data);
        pass(
            b.createView(),
            bp,
            bg(bp, bufs[2], [
                { binding: 1, resource: a.createView() },
                { binding: 2, resource: samp },
            ]),
        );
        data[0] = this.canvas.width;
        data[1] = this.canvas.height;
        d.queue.writeBuffer(bufs[3], 0, data);
        pass(
            cx.getCurrentTexture().createView(),
            cp,
            bg(cp, bufs[3], [
                { binding: 1, resource: st.createView() },
                { binding: 2, resource: b.createView() },
                { binding: 3, resource: samp },
            ]),
        );
        d.queue.submit([enc.finish()]);
    }
    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = 0;
        this.observer.disconnect();
        this.sceneTex?.destroy();
        this.blurA?.destroy();
        this.blurB?.destroy();
        this.buffers.forEach((x) => x.destroy());
        this.buffers = [];
        try {
            this.context?.unconfigure();
        } catch {}
        this.context = null;
        this.device?.destroy();
        this.device = undefined;
    }
    stop() {
        this.destroy();
    }
}
