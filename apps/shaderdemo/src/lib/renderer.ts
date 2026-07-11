export const FIELD_PARAMETER_SCHEMA = [
    { key: 'fieldScale', label: 'Base field size', min: 32, max: 2048, step: 1, default: 1007 },
    { key: 'flowStretch', label: 'Flow stretch', min: 0.35, max: 2.5, step: 0.01, default: 2.5 },
    { key: 'billowAmount', label: 'Cloud amount', min: -2, max: 2, step: 0.01, default: 1 },
    { key: 'ridgeAmount', label: 'Ribbon amount', min: -2, max: 2, step: 0.01, default: 2 },
    { key: 'ridgeSharpness', label: 'Ribbon sharpness', min: 0.4, max: 4, step: 0.01, default: 4 },
    { key: 'baseBlendMode', label: 'Blend mode', min: 0, max: 2, step: 1, default: 2 },
    { key: 'warpScale', label: 'Warp scale', min: 0.2, max: 2.5, step: 0.01, default: 0.2 },
    { key: 'warpStrength', label: 'Warp strength', min: 0, max: 1.5, step: 0.01, default: 0 },
    { key: 'secondaryEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 1 },
    { key: 'secondaryScale', label: 'Scale', min: 0, max: 2, step: 0.01, default: 0.45 },
    { key: 'secondaryCloudAmount', label: 'Cloud amount', min: -2, max: 2, step: 0.01, default: -0.25 },
    { key: 'secondaryRibbonAmount', label: 'Ribbon amount', min: -2, max: 2, step: 0.01, default: -1 },
    { key: 'secondaryRibbonSharpness', label: 'Ribbon sharpness', min: 0.4, max: 4, step: 0.01, default: 4 },
    { key: 'secondaryBlendMode', label: 'Cloud blend mode', min: 0, max: 2, step: 1, default: 2 },
    { key: 'secondaryRibbonBlendMode', label: 'Ribbon blend mode', min: 0, max: 2, step: 1, default: 2 },
    { key: 'thresholdEnabled', label: 'Enabled', min: 0, max: 1, step: 1, default: 1 },
    { key: 'threshold', label: 'Threshold', min: 0.05, max: 0.95, step: 0.01, default: 0.5 },
    { key: 'thresholdSoftness', label: 'Threshold softness', min: 0.01, max: 0.5, step: 0.01, default: 0.5 },
    { key: 'finalContrast', label: 'Final contrast', min: 0.2, max: 3, step: 0.01, default: 1.8 },
    { key: 'animationSpeed', label: 'Animation speed', min: 0, max: 3, step: 0.01, default: 0.45 },
    { key: 'centerDarkness', label: 'Center darkness', min: 0, max: 1.5, step: 0.01, default: 0.6 },
    { key: 'centerWidth', label: 'Center width', min: 0.1, max: 2.5, step: 0.01, default: 0.75 },
    { key: 'centerHeight', label: 'Center height', min: 0.1, max: 2.5, step: 0.01, default: 0.85 },
    { key: 'centerRoundness', label: 'Center roundness', min: 2, max: 12, step: 0.1, default: 4.7 },
    { key: 'centerSoftness', label: 'Center softness', min: 0.01, max: 1.5, step: 0.01, default: 1.5 },
] as const;

export const OCTAVE_COUNT = 5;
const noiseDefaults = Array<number>(OCTAVE_COUNT).fill(0.005);
const smoothnessDefaults = [0.85, 1, 0.5, 1, 1];
const distanceDefaults = [0.5, 0.1, 2, 1, 2];
const blurDefaults = [0, 0.5, 0.3, 0.3, 0.1];
export const OCTAVE_PARAMETER_SCHEMA = Array.from({ length: OCTAVE_COUNT }, (_, index) => {
    const octave = index + 1;
    return [
        {
            key: `octave${octave}Noise`,
            label: 'Noise amount',
            min: 0,
            max: 0.5,
            step: 0.005,
            default: noiseDefaults[index],
        },
        { key: `octave${octave}Threshold`, label: 'Threshold', min: -0.4, max: 0.4, step: 0.01, default: 0 },
        {
            key: `octave${octave}Smoothness`,
            label: 'Diffusion smoothness',
            min: 0,
            max: 1,
            step: 0.01,
            default: smoothnessDefaults[index],
        },
        {
            key: `octave${octave}Distance`,
            label: 'Diffusion distance',
            min: 0,
            max: 6,
            step: 0.05,
            default: distanceDefaults[index],
        },
    ];
});
export const OCTAVE_PIXELATE_SCHEMA = Array.from({ length: OCTAVE_COUNT }, (_, index) => ({
    key: `octave${index + 1}Pixelate` as `octave${number}Pixelate`,
    label: 'Pixelate canvas',
    min: 0,
    max: 1,
    step: 1,
    default: 0,
}));
export const OCTAVE_BLUR_SCHEMA = Array.from({ length: OCTAVE_COUNT }, (_, index) => ({
    key: `octave${index + 1}BlurRadius` as `octave${number}BlurRadius`,
    label: 'Pre-blur radius',
    min: 0,
    max: 2,
    step: 0.01,
    default: blurDefaults[index],
}));
export const PARAMETER_SCHEMA = [
    ...FIELD_PARAMETER_SCHEMA,
    ...OCTAVE_PARAMETER_SCHEMA.flat(),
    ...OCTAVE_PIXELATE_SCHEMA,
    ...OCTAVE_BLUR_SCHEMA,
];
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

/** Effect-space pixel sizes; every image pass itself remains full resolution. */
export function octavePixelSizes() {
    // The first destructive tap comes from the coarsest stage; later taps add progressively finer pixels.
    return Array.from({ length: OCTAVE_COUNT }, (_, index) => 2 ** (OCTAVE_COUNT - 1 - index));
}

/** The base and five octave effect stages all have the same full render dimensions. */
export function fullResolutionPassSizes(width: number, height: number, renderScale: number) {
    const size = scaledSize(width, height, renderScale);
    return Array.from({ length: OCTAVE_COUNT + 1 }, () => ({ ...size }));
}

export const UNIFORM_FLOATS = 60;
export function packUniform(
    resolution: [number, number],
    time: number,
    seed: number,
    parameters: ShaderParameters,
    octaveIndex = 0,
    frameIndex = 0,
) {
    const data = new Float32Array(UNIFORM_FLOATS);
    data.set([resolution[0], resolution[1], time, seed, ...FIELD_PARAMETER_SCHEMA.map(({ key }) => parameters[key])]);
    data[29] = octaveIndex;
    data[30] = OCTAVE_PIXELATE_SCHEMA.reduce(
        (mask, { key }, index) => mask + (parameters[key] >= 0.5 ? 2 ** index : 0),
        0,
    );
    data[31] = frameIndex;
    data.set(
        OCTAVE_PARAMETER_SCHEMA.flatMap((group) => group.map(({ key }) => parameters[key])),
        32,
    );
    data.set(
        OCTAVE_BLUR_SCHEMA.map(({ key }) => parameters[key]),
        52,
    );
    return data;
}

export function octaveEffectIsActive(parameters: ShaderParameters, index: number) {
    const settings = OCTAVE_PARAMETER_SCHEMA[index];
    return (
        parameters[OCTAVE_PIXELATE_SCHEMA[index].key] >= 0.5 ||
        parameters[settings[0].key] !== 0 ||
        parameters[settings[1].key] !== 0 ||
        parameters[settings[3].key] !== 0
    );
}

export function octaveBlurIsActive(parameters: ShaderParameters, index: number) {
    return parameters[OCTAVE_BLUR_SCHEMA[index].key] > 0;
}

/** Stable identity for bind groups whose resources are all renderer-owned. */
export function bindGroupCacheKey(pipelineIndex: number, sourceTextureIndex: number | undefined, passIndex: number) {
    return `${pipelineIndex}:${sourceTextureIndex ?? 'none'}:${passIndex}`;
}

export function advanceSimulationTime(time: number, deltaSeconds: number, speed: number) {
    return time + deltaSeconds * speed;
}

export const COMMON_SHADER_SOURCE = /* wgsl */ `
struct U {
 resolution: vec2f, time: f32, seed: f32,
 fieldScale: f32, flowStretch: f32, billowAmount: f32, ridgeAmount: f32,
 ridgeSharpness: f32, baseBlendMode: f32, warpScale: f32, warpStrength: f32,
 secondaryEnabled: f32, secondaryScale: f32, secondaryCloudAmount: f32,
 secondaryRibbonAmount: f32, secondaryRibbonSharpness: f32, secondaryBlendMode: f32,
 secondaryRibbonBlendMode: f32,
 thresholdEnabled: f32, threshold: f32, thresholdSoftness: f32, finalContrast: f32,
 animationSpeed: f32,
 centerDarkness: f32, centerWidth: f32, centerHeight: f32, centerRoundness: f32,
 centerSoftness: f32, octaveIndex: f32, octavePixelationMask: f32, frameIndex: f32,
 octaves: array<vec4f, 5>,
 blurRadii: array<vec4f, 2>
};
@group(0) @binding(0) var<uniform> u: U;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
    let p = array(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3)); return vec4f(p[i],0,1);
}
fn hash3(p: vec3f, seedSalt: f32) -> f32 {
    return fract(sin(dot(p,vec3f(127.1,311.7,74.7)) + u.seed*19.19 + seedSalt*53.17)*43758.5453);
}
fn simplexGradient(lattice: vec3f, seedSalt: f32) -> vec3f {
    let gradients=array<vec3f,12>(
        vec3f(1,1,0),vec3f(-1,1,0),vec3f(1,-1,0),vec3f(-1,-1,0),
        vec3f(1,0,1),vec3f(-1,0,1),vec3f(1,0,-1),vec3f(-1,0,-1),
        vec3f(0,1,1),vec3f(0,-1,1),vec3f(0,1,-1),vec3f(0,-1,-1)
    );
    return gradients[u32(floor(hash3(lattice,seedSalt)*12.))];
}
fn simplexCorner(lattice: vec3f, offset: vec3f, seedSalt: f32) -> f32 {
    let kernel=max(.6-dot(offset,offset),0.);
    return kernel*kernel*kernel*kernel*dot(simplexGradient(lattice,seedSalt),offset);
}
fn noise3(p: vec3f, seedSalt: f32) -> f32 {
    // Isotropic simplex gradient noise: all axes share one tetrahedral lattice and compact C2 kernel.
    let skew=(p.x+p.y+p.z)/3.;
    let cell=floor(p+skew);
    let unskew=(cell.x+cell.y+cell.z)/6.;
    let x0=p-(cell-unskew);
    let first=select(vec3f(0),vec3f(1),x0>=x0.yzx);
    let second=select(vec3f(0),vec3f(1),x0>x0.zxy);
    let i1=min(first,second);
    let i2=max(first,second);
    let x1=x0-i1+vec3f(1./6.);
    let x2=x0-i2+vec3f(1./3.);
    let x3=x0-vec3f(.5);
    let sum=simplexCorner(cell,x0,seedSalt)+simplexCorner(cell+i1,x1,seedSalt)+simplexCorner(cell+i2,x2,seedSalt)+simplexCorner(cell+vec3f(1),x3,seedSalt);
    // Conventional 32x simplex normalization, remapped approximately from [-1,1] to [0,1].
    return .5+16.*sum;
}
fn noise3v(p: vec2f, z: f32) -> vec2f {
    return vec2f(noise3(vec3f(p,z),101.),noise3(vec3f(p+vec2f(17.7,43.2),z+11.3),211.));
}
fn screen01(a: f32, b: f32) -> f32 { return 1.-(1.-clamp(a,0.,1.))*(1.-clamp(b,0.,1.)); }
fn overlay01(backdrop: f32, source: f32) -> f32 {
    let a=clamp(backdrop,0.,1.); let b=clamp(source,0.,1.);
    return select(2.*a*b,1.-2.*(1.-a)*(1.-b),a>.5);
}
fn blendSigned(backdrop: f32, source: f32, mode: f32) -> f32 {
    if(source==0.) { return backdrop; }
    if(mode<.5) { return backdrop+source; }
    if(mode<1.5) {
        // Signed screen: equal signs screen magnitudes; a negative source multiplicatively
        // darkens a positive backdrop, retaining excess strength as signed subtraction.
        if(source<0. && backdrop>0.) { let m=-source; return backdrop*(1.-min(m,1.))-max(m-1.,0.); }
        if(source>=0. && backdrop<0.) { return backdrop+source; }
        let sign=select(-1.,1.,backdrop+source>=0.);
        return sign*screen01(abs(backdrop),abs(source));
    }
    // Standard [0,1] overlay, mixed by signed source strength so zero remains an identity.
    let strength=min(abs(source),1.);
    let operand=select(clamp(source,0.,1.),1.-clamp(-source,0.,1.),source<0.);
    let overlaid=overlay01(backdrop,operand);
    return mix(backdrop,overlaid,strength)-select(0.,max(-source-1.,0.),source<0.);
}
fn smoothAbsFold(value: f32) -> f32 {
    // 0.001 removes the derivative cusp at the Cloud fold with negligible Add-mode displacement.
    return sqrt(value*value+0.000001)-0.001;
}
`;

export const BASE_SHADER_SOURCE =
    COMMON_SHADER_SOURCE +
    /* wgsl */ `
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    var q=(pos.xy/u.resolution)*2.-1.; q.x*=u.resolution.x/u.resolution.y;
    let t=u.time;
    // Interpret field size against a 1080px reference height, not the render target's physical pixels.
    // The composition therefore stays stable across resolutions while higher-resolution targets add detail.
    let fieldPixel=q*(540./u.fieldScale);
    let flow=mat2x2f(.89,.45,-.45,.89)*vec2f(fieldPixel.x,fieldPixel.y*u.flowStretch);
    var warpOffset=vec2f(0.);
    let secondaryHasAmount=u.secondaryEnabled>=.5 && (u.secondaryCloudAmount!=0. || u.secondaryRibbonAmount!=0.);
    let fieldHasAmount=u.billowAmount!=0. || u.ridgeAmount!=0. || secondaryHasAmount;
    if(fieldHasAmount && u.warpStrength!=0.) {
        warpOffset=(noise3v(flow*u.warpScale,t*.11)-.5)*u.warpStrength;
    }
    let p=flow+warpOffset;
    let primaryPosition=vec3f(p,t*.075);
    var shaped=0.;
    if(u.billowAmount!=0.) {
        let cloud=smoothAbsFold(noise3(primaryPosition,307.)*2.-1.);
        shaped=cloud*u.billowAmount;
    }
    if(u.ridgeAmount!=0.) {
        let ribbonBase=1.-abs(noise3(primaryPosition,401.)*2.-1.);
        let ribbon=pow(clamp(ribbonBase,0.,1.),u.ridgeSharpness);
        shaped=blendSigned(shaped,ribbon*u.ridgeAmount,u.baseBlendMode);
    }
    var natural=shaped;
    if(u.secondaryEnabled>=.5 && (u.secondaryCloudAmount!=0. || u.secondaryRibbonAmount!=0.)) {
        let secondaryPosition=vec3f(p*u.secondaryScale+vec2f(13.7,-8.4)-warpOffset*.41,t*.12+7.1);
        if(u.secondaryCloudAmount!=0.) {
            let secondaryCloud=smoothAbsFold(noise3(secondaryPosition,503.)*2.-1.);
            natural=blendSigned(natural,secondaryCloud*u.secondaryCloudAmount,u.secondaryBlendMode);
        }
        if(u.secondaryRibbonAmount!=0.) {
            let secondaryRibbonBase=1.-abs(noise3(secondaryPosition,601.)*2.-1.);
            let secondaryRibbon=pow(clamp(secondaryRibbonBase,0.,1.),u.secondaryRibbonSharpness);
            natural=blendSigned(natural,secondaryRibbon*u.secondaryRibbonAmount,u.secondaryRibbonBlendMode);
        }
    }
    if(u.centerDarkness!=0.) {
        let centerPoint=abs(q/vec2f(u.centerWidth,u.centerHeight));
        let centerDistance=pow(pow(centerPoint.x,u.centerRoundness)+pow(centerPoint.y,u.centerRoundness),1./u.centerRoundness);
        let centerFeather=u.centerSoftness*.5;
        let center=1.-smoothstep(1.-centerFeather,1.+centerFeather,centerDistance);
        natural*=exp2(-center*u.centerDarkness*4.);
    }
    // Field shaping finishes here; recursive scatter/noise is the next destructive stage on top.
    if(u.thresholdEnabled<.5) { return vec4f(natural,0.,0.,1.); }
    let thresholdWidth=max(u.thresholdSoftness,fwidth(natural)*1.5);
    let thresholded=smoothstep(u.threshold-thresholdWidth,u.threshold+thresholdWidth,natural);
    return vec4f(thresholded,0.,0.,1.);
}`;

export const BLUR_SHADER_SOURCE =
    COMMON_SHADER_SOURCE +
    /* wgsl */ `
@group(0) @binding(1) var src: texture_2d<f32>; @group(0) @binding(2) var samp: sampler;
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let uv=pos.xy/u.resolution;
    let sourceSize=vec2f(textureDimensions(src));
    let radiusIndex=u32(u.octaveIndex);
    let radius=u.blurRadii[radiusIndex/4u][radiusIndex%4u];
    if(radius<=0.) { return vec4f(textureSample(src,samp,uv).r,0.,0.,1.); }
    // Four bilinearly filtered diagonal taps provide a compact, scale-relative Kawase blur.
    let octavePixelSize=exp2(4.-u.octaveIndex);
    let offset=vec2f(octavePixelSize*radius)/sourceSize;
    var value=textureSample(src,samp,uv+offset).r*.25;
    value+=textureSample(src,samp,uv+vec2f(-offset.x,offset.y)).r*.25;
    value+=textureSample(src,samp,uv+vec2f(offset.x,-offset.y)).r*.25;
    value+=textureSample(src,samp,uv-offset).r*.25;
    return vec4f(value,0.,0.,1.);
}`;

export const OCTAVE_SHADER_SOURCE =
    COMMON_SHADER_SOURCE +
    /* wgsl */ `
@group(0) @binding(1) var src: texture_2d<f32>; @group(0) @binding(2) var samp: sampler;
fn avalanche(value: u32) -> u32 {
    var x=value;
    x^=x>>16u; x*=0x7feb352du; x^=x>>15u; x*=0x846ca68bu; x^=x>>16u;
    return x;
}
fn tileHash(tile: vec2u, salt: u32) -> u32 {
    return avalanche((tile.x*0x9e3779b9u) ^ (tile.y*0x85ebca6bu) ^ (u32(u.seed)*0xc2b2ae35u) ^ salt);
}
fn scatterOffset(tile: vec2u, sampleIndex: u32, distance: f32, octaveFrameSalt: u32) -> vec2f {
    // Paint.NET Frosted Glass: one hash supplies an independent quantized direction and radius per sample.
    let directions=array<vec2f,16>(
        vec2f(1.,0.),vec2f(.9238795,.3826834),vec2f(.7071068,.7071068),vec2f(.3826834,.9238795),
        vec2f(0.,1.),vec2f(-.3826834,.9238795),vec2f(-.7071068,.7071068),vec2f(-.9238795,.3826834),
        vec2f(-1.,0.),vec2f(-.9238795,-.3826834),vec2f(-.7071068,-.7071068),vec2f(-.3826834,-.9238795),
        vec2f(0.,-1.),vec2f(.3826834,-.9238795),vec2f(.7071068,-.7071068),vec2f(.9238795,-.3826834)
    );
    let bits=tileHash(tile,octaveFrameSalt ^ (sampleIndex*0x165667b1u));
    let radius=f32(bits>>8u)*(1./16777215.)*distance;
    return directions[bits&15u]*radius;
}
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let uv=pos.xy/u.resolution;
    let sourceSize=vec2f(textureDimensions(src));
    let octave=u32(u.octaveIndex);
    let settings=u.octaves[octave];
    let pixel=vec2u(pos.xy);
    let tileShift=4u-octave;
    let octavePixelSizeU=1u<<tileShift;
    let tile=pixel>>vec2u(tileShift);
    let pixelationBit=(u32(u.octavePixelationMask)&(1u<<octave))!=0u;
    let octavePixelSize=f32(octavePixelSizeU);
    let tiledUv=(vec2f(tile)+.5)*octavePixelSize/sourceSize;
    let sourceUv=select(uv,tiledUv,pixelationBit);
    let sampleCount=u32(round(mix(1.,4.,settings.z)));
    // Radius zero is an exact identity operation: no random resampling and no accumulated softening.
    var scattered: f32;
    if(settings.w>0.) {
        scattered=0.;
        let octaveFrameSalt=(octave*0x27d4eb2du) ^ (u32(u.frameIndex)*0x9e3779b9u);
        for(var sampleIndex=0u;sampleIndex<4u;sampleIndex++) {
            if(sampleIndex<sampleCount) {
                // Run Frosted Glass in this octave's virtual pixel grid. Every real pixel inside a tile
                // receives the same whole-tile displacement while retaining its local detail.
                let tileOffset=round(scatterOffset(tile,sampleIndex,settings.w,octaveFrameSalt));
                let offset=tileOffset*octavePixelSize;
                scattered+=textureSample(src,samp,sourceUv+offset/sourceSize).r;
            }
        }
        scattered/=f32(sampleCount);
    } else {
        scattered=textureSample(src,samp,sourceUv).r;
    }
    // Paint.NET's smoothness is sample count: 1–4 randomly displaced bilinear samples blended together.
    // Diffusion offsets and electrical noise are independently re-salted every rendered frame.
    // Literal noise is constant per effect-space tile, but independently salted for each rendered frame.
    var injected=scattered;
    if(settings.x!=0.) {
        let noiseSalt=(octave*0x27d4eb2du) ^ (u32(u.frameIndex)*0x165667b1u) ^ 0xa511e9b3u;
        let noiseBits=tileHash(tile,noiseSalt);
        let detail=f32(noiseBits)*(1./4294967295.)-.5;
        injected+=detail*settings.x;
    }
    if(settings.y==0.) { return vec4f(injected,0.,0.,1.); }
    let thresholdWidth=max(.015,fwidth(injected)*1.5);
    let thresholded=smoothstep(settings.y-thresholdWidth,settings.y+thresholdWidth,injected);
    return vec4f(thresholded,0.,0.,1.);
}`;

const displayShader =
    COMMON_SHADER_SOURCE +
    /* wgsl */ `
@group(0) @binding(1) var src: texture_2d<f32>; @group(0) @binding(2) var samp: sampler;
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let uv=pos.xy/u.resolution;
    let density=textureSample(src,samp,uv).r;
    let f=pow(clamp(density,0.,1.),u.finalContrast);
    return vec4f(vec3f(f),1.);
}`;

export class AtmosphereRenderer {
    private device?: GPUDevice;
    private context: GPUCanvasContext | null = null;
    private pipelines: GPURenderPipeline[] = [];
    private textures: GPUTexture[] = [];
    private textureViews: GPUTextureView[] = [];
    private sampler?: GPUSampler;
    private buffers: GPUBuffer[] = [];
    private bindGroups = new Map<string, GPUBindGroup>();
    private observer: ResizeObserver;
    private rafId = 0;
    private simTime = 0;
    private frameIndex = 0;
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
            make(BASE_SHADER_SOURCE, 'r16float'),
            make(BLUR_SHADER_SOURCE, 'r16float'),
            make(OCTAVE_SHADER_SOURCE, 'r16float'),
            make(displayShader, format),
        ]);
        self.buffers = Array.from({ length: 2 * OCTAVE_COUNT + 2 }, () =>
            self.device!.createBuffer({
                size: UNIFORM_FLOATS * 4,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            }),
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
        this.textureViews = [];
        this.bindGroups.clear();
        const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
        // Two full-resolution targets ping-pong through each octave's blur and effect passes.
        const size = scaledSize(this.canvas.width, this.canvas.height, this.options.renderScale);
        this.textures = Array.from({ length: 2 }, () => {
            return this.device!.createTexture({ size: [size.width, size.height], format: 'r16float', usage });
        });
        this.textureViews = this.textures.map((texture) => texture.createView());
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
        if (
            !d ||
            !c ||
            buffers.length < 2 * OCTAVE_COUNT + 2 ||
            !s ||
            this.pipelines.length < 4 ||
            this.textures.length < 2 ||
            this.textureViews.length < 2
        )
            return;
        const enc = d.createCommandEncoder();
        const data = packUniform(
            [this.textures[0].width, this.textures[0].height],
            this.simTime,
            this.options.seed,
            this.options.parameters,
            0,
            this.frameIndex,
        );
        let passIndex = 0;
        const draw = (
            target: GPUTextureView,
            pipelineIndex: number,
            sourceTextureIndex?: number,
            usesSampler = false,
        ) => {
            const uniformSlot = passIndex++;
            const buffer = buffers[uniformSlot];
            d.queue.writeBuffer(buffer, 0, data);
            const pipeline = this.pipelines[pipelineIndex];
            const cacheKey = bindGroupCacheKey(pipelineIndex, sourceTextureIndex, uniformSlot);
            let bindGroup = this.bindGroups.get(cacheKey);
            if (!bindGroup) {
                const entries: GPUBindGroupEntry[] = [{ binding: 0, resource: { buffer } }];
                if (sourceTextureIndex !== undefined) {
                    entries.push({ binding: 1, resource: this.textureViews[sourceTextureIndex] });
                    if (usesSampler) entries.push({ binding: 2, resource: s });
                }
                bindGroup = d.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries });
                this.bindGroups.set(cacheKey, bindGroup);
            }
            const pass = enc.beginRenderPass({
                colorAttachments: [
                    { view: target, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } },
                ],
            });
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.draw(3);
            pass.end();
        };
        draw(this.textureViews[0], 0);
        let current = 0;
        for (let octave = 0; octave < OCTAVE_COUNT; octave += 1) {
            data[29] = octave;
            if (octaveBlurIsActive(this.options.parameters, octave)) {
                const scratch = 1 - current;
                draw(this.textureViews[scratch], 1, current, true);
                current = scratch;
            }
            if (octaveEffectIsActive(this.options.parameters, octave)) {
                const scratch = 1 - current;
                draw(this.textureViews[scratch], 2, current, true);
                current = scratch;
            }
        }
        data[0] = this.canvas.width;
        data[1] = this.canvas.height;
        draw(c.getCurrentTexture().createView(), 3, current, true);
        d.queue.submit([enc.finish()]);
        this.frameIndex = (this.frameIndex + 1) % 16_777_216;
    }
    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.observer.disconnect();
        this.textures.forEach((texture) => texture.destroy());
        this.textureViews = [];
        this.bindGroups.clear();
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
