import type { RenderBackend } from './render-backend';
import type { RenderOptions } from './renderer';
import { FrameTelemetry } from './telemetry';

export const WEBGL2_STARTUP_SCALE = 0.5;
export const WEBGL2_SUPPORTED_POST = new Set(['glow', 'chromatic-aberration']);

const VERTEX = `#version 300 es
const vec2 P[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
out vec2 uv; void main(){gl_Position=vec4(P[gl_VertexID],0.,1.);uv=P[gl_VertexID]*.5+.5;}`;

// A deliberately bounded single-pass port of the canonical field -> colour -> post -> octave scene.
// Dormant effects are bypassed by the CPU support table rather than approximated here.
export const WEBGL2_FRAGMENT_SOURCE = `#version 300 es
precision highp float; in vec2 uv; out vec4 outColor;
uniform vec2 resolution; uniform float time,seed,fieldScale,flowStretch,cloudAmount,ribbonAmount,ribbonSharpness;
uniform float threshold,thresholdSoftness,centerDarkness,centerWidth,centerHeight,centerRoundness,contrast,temperature,chromatic,grain;
float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33+seed);return fract((p.x+p.y)*p.z);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);float n=mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1)),f.x),f.y),f.z);return n;}
float field(vec2 q){
 q.x*=resolution.x/resolution.y;q.y*=flowStretch;float z=time*.09;
 float n=noise(vec3(q*fieldScale/620.,z));
 float cloud=abs(n*2.-1.);float ribbon=pow(max(0.,1.-cloud),max(.1,ribbonSharpness));
 float v=cloud*cloudAmount+ribbon*ribbonAmount;
 vec2 p=(uv-.5)/max(vec2(.001),vec2(centerWidth,centerHeight));
 float shape=pow(pow(abs(p.x),centerRoundness)+pow(abs(p.y),centerRoundness),1./centerRoundness);
 v-=centerDarkness*(1.-smoothstep(.0,max(.001,thresholdSoftness),shape));
 return smoothstep(threshold-thresholdSoftness*.5,threshold+thresholdSoftness*.5,v*.5);
}
vec3 palette(float v){
 vec3 c=mix(vec3(.003,.001,.012),vec3(.055,.005,.13),smoothstep(.02,.28,v));
 c=mix(c,vec3(.58,.015,.32),smoothstep(.3,.58,v));
 c=mix(c,vec3(1.,.12,.48),smoothstep(.58,.78,v));
 c=mix(c,vec3(1.,.72,.48),smoothstep(.78,.94,v));
 float warm=clamp((temperature-6500.)/5000.,-1.,1.);c*=vec3(1.+warm*.12,1.,1.-warm*.12);
 return clamp((c-.5)*contrast+.5,0.,1.);
}
void main(){vec2 q=uv;float d=chromatic/resolution.x;vec3 c=vec3(field(q+vec2(d,0)),field(q),field(q-vec2(d,0)));c=vec3(palette(c.r).r,palette(c.g).g,palette(c.b).b);float glow=smoothstep(.55,1.,max(c.r,max(c.g,c.b)));c+=vec3(.18,.035,.12)*glow;c+=(hash(vec3(gl_FragCoord.xy,time))-0.5)*grain;outColor=vec4(clamp(c,0.,1.),1.);}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Could not allocate a WebGL2 shader.');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const diagnostic = gl.getShaderInfoLog(shader) || 'unknown shader error';
        gl.deleteShader(shader);
        throw new Error(`WebGL2 shader compilation failed: ${diagnostic}`);
    }
    return shader;
}

export class WebGL2Renderer implements RenderBackend {
    readonly backend = 'webgl2' as const;
    onStats: RenderBackend['onStats'];
    onGpuStats: RenderBackend['onGpuStats'];
    onLost: RenderBackend['onLost'];
    get unsupportedEffects() {
        return this.options.post
            .filter((effect) => effect.enabled && !WEBGL2_SUPPORTED_POST.has(effect.type))
            .map((effect) => effect.type);
    }
    private raf = 0;
    private paused = false;
    private destroyed = false;
    private invalid = true;
    private start = performance.now();
    private lastPresented = 0;
    private fence: WebGLSync | null = null;
    private telemetry = new FrameTelemetry();
    private observer: ResizeObserver;
    private uniforms = new Map<string, WebGLUniformLocation | null>();

    private constructor(
        private canvas: HTMLCanvasElement,
        private gl: WebGL2RenderingContext,
        private program: WebGLProgram,
        private options: RenderOptions,
    ) {
        this.observer = new ResizeObserver(() => {
            this.resize();
            this.invalidate();
        });
    }

    static async create(canvas: HTMLCanvasElement, options: RenderOptions) {
        const gl = canvas.getContext('webgl2', {
            alpha: false,
            antialias: false,
            powerPreference: 'low-power',
            preserveDrawingBuffer: false,
        });
        if (!gl) throw new Error('This browser did not provide a WebGL2 context.');
        const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
        const fragment = compile(gl, gl.FRAGMENT_SHADER, WEBGL2_FRAGMENT_SOURCE);
        const program = gl.createProgram();
        if (!program) throw new Error('Could not allocate a WebGL2 program.');
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const diagnostic = gl.getProgramInfoLog(program) || 'unknown link error';
            gl.deleteProgram(program);
            throw new Error(`WebGL2 program link failed: ${diagnostic}`);
        }
        const renderer = new WebGL2Renderer(canvas, gl, program, options);
        canvas.addEventListener('webglcontextlost', renderer.contextLost);
        canvas.addEventListener('webglcontextrestored', renderer.contextRestored);
        renderer.observer.observe(canvas);
        renderer.resize();
        renderer.onGpuStats?.(null);
        renderer.render(performance.now()); // prove a visible frame before starting animation
        renderer.schedule();
        return renderer;
    }

    private contextLost = (event: Event) => {
        event.preventDefault();
        this.paused = true;
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.onLost?.('WebGL2 context lost. Reload to recover.');
    };
    private contextRestored = () => this.onLost?.('WebGL2 context restored; reload to rebuild graphics resources.');
    private schedule() {
        if (!this.destroyed && !this.raf) this.raf = requestAnimationFrame(this.tick);
    }
    private tick = (now: number) => {
        this.raf = 0;
        if (this.destroyed) return;
        if (!this.paused && now - this.lastPresented + 0.5 >= 1000 / 60) {
            // A zero-timeout fence is an asynchronous backpressure probe: never finish/read back.
            if (this.fence) {
                const status = this.gl.clientWaitSync(this.fence, 0, 0);
                if (status === this.gl.TIMEOUT_EXPIRED) return this.schedule();
                this.gl.deleteSync(this.fence);
                this.fence = null;
            }
            this.render(now);
        } else if (this.invalid) this.render(now);
        if (!this.paused) this.schedule();
    };
    private render(now: number) {
        const gl = this.gl;
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.useProgram(this.program);
        const uniform = (name: string) => {
            if (!this.uniforms.has(name)) this.uniforms.set(name, gl.getUniformLocation(this.program, name));
            return this.uniforms.get(name) ?? null;
        };
        const p = this.options.parameters;
        gl.uniform2f(uniform('resolution'), this.canvas.width, this.canvas.height);
        gl.uniform1f(uniform('time'), ((now - this.start) / 1000) * p.animationSpeed);
        gl.uniform1f(uniform('seed'), this.options.seed);
        gl.uniform1f(uniform('fieldScale'), p.fieldScale);
        gl.uniform1f(uniform('flowStretch'), p.flowStretch);
        gl.uniform1f(uniform('cloudAmount'), p.billowAmount);
        gl.uniform1f(uniform('ribbonAmount'), p.ridgeAmount);
        gl.uniform1f(uniform('ribbonSharpness'), p.ridgeSharpness);
        gl.uniform1f(uniform('threshold'), p.thresholdEnabled >= 0.5 ? p.threshold : 0);
        gl.uniform1f(uniform('thresholdSoftness'), p.thresholdEnabled >= 0.5 ? p.thresholdSoftness : 1);
        gl.uniform1f(uniform('centerDarkness'), p.centerDarkness);
        gl.uniform1f(uniform('centerWidth'), p.centerWidth);
        gl.uniform1f(uniform('centerHeight'), p.centerHeight);
        gl.uniform1f(uniform('centerRoundness'), p.centerRoundness);
        gl.uniform1f(uniform('contrast'), Math.max(0.1, p.finalContrast + p.contrast + 1));
        gl.uniform1f(uniform('temperature'), p.temperature);
        gl.uniform1f(uniform('chromatic'), p.chromaticAberrationEnabled >= 0.5 ? p.chromaticAberration : 0);
        gl.uniform1f(uniform('grain'), p.filmGrainEnabled >= 0.5 ? p.filmGrainAmount : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        this.invalid = false;
        this.lastPresented = now;
        this.telemetry.recordRenderedFrame(now);
        const rolling = this.telemetry.summary(now);
        this.onStats?.(
            rolling.windows[500]?.fps ?? 0,
            this.canvas.width,
            this.canvas.height,
            rolling,
            WEBGL2_STARTUP_SCALE,
        );
    }
    private resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = Math.min(devicePixelRatio, this.options.dprCap);
        const width = Math.max(1, Math.floor(rect.width * dpr * WEBGL2_STARTUP_SCALE));
        const height = Math.max(1, Math.floor(rect.height * dpr * WEBGL2_STARTUP_SCALE));
        if (width !== this.canvas.width || height !== this.canvas.height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
    }
    setOptions(options: RenderOptions) {
        this.options = options;
        this.invalidate();
    }
    setPaused(paused: boolean) {
        this.paused = paused;
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
        this.gl.deleteProgram(this.program);
    }
}
