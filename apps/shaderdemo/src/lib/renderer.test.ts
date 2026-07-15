// @ts-nocheck -- legacy v1 assertions retained as runtime migration coverage
import { describe, expect, it } from 'vitest';
import {
    BASE_SHADER_SOURCE,
    AtmosphereRenderer,
    BLOOM_BLUR_SHADER_SOURCE,
    BLOOM_EXTRACT_SHADER_SOURCE,
    BLOOM_TEXTURE_FORMAT,
    BLUR_SHADER_SOURCE,
    COMMON_SHADER_SOURCE,
    CURSOR_DENSITY_UNIFORM_BYTES,
    CURSOR_PAINT_SHADER_SOURCE,
    FIELD_PARAMETER_SCHEMA,
    FIELD_BLEND_MODES,
    POST_BLEND_MODES,
    POST_EFFECT_SHADER_SOURCE,
    compactPostShaderSource,
    POST_TEXTURE_FORMAT,
    POST_PARAMETER_SCHEMA,
    DISPLAY_SHADER_SOURCE,
    GOD_RAYS_SHADER_SOURCE,
    GOD_RAYS_TEXTURE_FORMAT,
    LUT_SHADER_SOURCE,
    cubeRgba16Data,
    OCTAVE_BLUR_SCHEMA,
    OCTAVE_COUNT,
    OCTAVE_PARAMETER_SCHEMA,
    OCTAVE_PIXELATE_SCHEMA,
    OCTAVE_SHADER_SOURCE,
    PARAMETER_SCHEMA,
    UNIFORM_FLOATS,
    GPU_TIMING_SAMPLE_INTERVAL,
    GPU_FRAME_TIMING_RING_SIZE,
    MAX_IN_FLIGHT_SUBMISSIONS,
    aggregateGpuTimestamps,
    advanceSimulationTime,
    bindGroupCacheKey,
    defaultParameters,
    fullResolutionPassSizes,
    godRaysIsActive,
    octavePixelSizes,
    octaveBlurIsActive,
    octaveEffectIsActive,
    packUniform,
    renderSize,
    scaledSize,
} from './renderer';
import { defaultShaderSettings, normalizeSavedSettings } from './settings';
import defaultSettingsFixture from './default-settings.json';

describe('field configuration', () => {
    it('samples persistent density in top-left screen UV without point-list density', () => {
        expect(BASE_SHADER_SOURCE).toContain('@group(0) @binding(2) var densityField:texture_2d<f32>');
        expect(BASE_SHADER_SOURCE).toContain('densityPressure=textureSample(densityField,densitySampler,uv).r');
        expect(BASE_SHADER_SOURCE).toContain('cursorDensity=cp(2u)*densityPressure');
        expect(BASE_SHADER_SOURCE.match(/textureSample\(densityField/g)).toHaveLength(1);
        expect(BASE_SHADER_SOURCE).not.toContain('headEnergy');
        expect(BASE_SHADER_SOURCE).not.toContain('let gradient=');
        expect(BASE_SHADER_SOURCE).not.toContain('let displacement=');
        expect(BASE_SHADER_SOURCE).not.toContain('textureDimensions(densityField)');
        expect(BASE_SHADER_SOURCE.indexOf('natural+=cursorDensity')).toBeLessThan(
            BASE_SHADER_SOURCE.indexOf('if(u.thresholdEnabled<.5)'),
        );
        expect(BASE_SHADER_SOURCE.indexOf('natural+=cursorDensity')).toBeGreaterThan(
            BASE_SHADER_SOURCE.indexOf('natural*=exp2(-center*u.centerDarkness*4.)'),
        );
        expect(BASE_SHADER_SOURCE).toContain('1.-clamp(natural,0.,1.)');
        expect(BASE_SHADER_SOURCE).not.toContain('halogen');
    });
    it('uses dedicated rgba8 Post targets and ordered fused shader kinds', () => {
        expect(POST_TEXTURE_FORMAT).toBe('rgba8unorm');
        expect(POST_EFFECT_SHADER_SOURCE).toContain('else if(kind==25)');
        expect(POST_EFFECT_SHADER_SOURCE).toContain('else{let g=frameHash');
    });
    it('uses radial lens chromatic aberration with an undistorted optical centre', () => {
        expect(POST_EFFECT_SHADER_SOURCE).toContain('let radial=uv-vec2f(.5)');
        expect(POST_EFFECT_SHADER_SOURCE).toContain('redUv=safe(uv+radial*amount)');
        expect(POST_EFFECT_SHADER_SOURCE).toContain('blueUv=safe(uv-radial*amount)');
        expect(POST_EFFECT_SHADER_SOURCE).not.toContain('uv+vec2f(d,0)');
    });

    it('builds standalone WebGPU shaders for every baked Post stage', () => {
        for (const kind of [1, 2, 3, 27]) {
            const source = compactPostShaderSource(kind);
            expect(source.length).toBeLessThan(POST_EFFECT_SHADER_SOURCE.length * 0.7);
            expect(source).not.toContain('let kind=');
            expect(source).not.toContain('else if(kind');
            expect(source.match(/@fragment fn fs/g)).toHaveLength(1);
        }
        const implementation = AtmosphereRenderer.toString();
        expect(implementation).toContain('compactPostShaderSource(primaryPostKind)');
        expect(implementation).toContain('this.compactPostPipelineIndices.get(postKind) ?? 8');
    });

    it('re-hashes film grain independently every rendered frame instead of translating a fixed field', () => {
        expect(POST_EFFECT_SHADER_SOURCE).toContain('frameHash(floor(pos.xy/p(31)),u32(u.frameIndex))');
        expect(POST_EFFECT_SHADER_SOURCE).toContain('frame*0xc2b2ae35u');
        expect(POST_EFFECT_SHADER_SOURCE).not.toContain('floor(pos.xy/p(31))+vec2f(u.frameIndex)');
    });

    it('binds and samples a hardware-filtered 3D LUT with domain and intensity', () => {
        expect(LUT_SHADER_SOURCE).toContain('var cube:texture_3d<f32>');
        expect(LUT_SHADER_SOURCE).toContain('textureSample(cube,samp,coordinate)');
        expect(LUT_SHADER_SOURCE).toContain('(source-domainMin)/(domainMax-domainMin)');
        expect(LUT_SHADER_SOURCE).toContain('mix(source,mapped,clamp(p(6),0.,1.))');
        expect(Array.from(cubeRgba16Data(new Float32Array([0, 0.5, 1])))).toEqual([0, 0x3800, 0x3c00, 0x3c00]);
    });
    it('runs one Post pipeline after Colour and before Octaves', () => {
        const source = AtmosphereRenderer.toString();
        const adjustments = source.indexOf('colour:adjustments');
        const rgb = source.indexOf('const colourOccurrences');
        const post = source.indexOf('effect.label');
        const octave = source.indexOf('octave${octave + 1}');
        const display = source.indexOf('getCurrentTexture');
        expect([adjustments, rgb, post, octave, display]).not.toContain(-1);
        expect(adjustments).toBeLessThan(rgb);
        expect(rgb).toBeLessThan(post);
        expect(post).toBeLessThan(octave);
        expect(octave).toBeLessThan(display);
        expect(source).not.toContain('lighting:${effect.kind}');
    });
    it('samples Paint.NET Zoom Blur’s 64-step contraction path at a selectable render scale', () => {
        const distance = PARAMETER_SCHEMA.find(({ key }) => key === 'godRaysAmount');
        expect(distance).toMatchObject({ label: 'Distance', min: -100, max: 100, default: 0 });
        expect(GOD_RAYS_SHADER_SOURCE).toContain('1.-u.post[2].z/16384.');
        expect(GOD_RAYS_SHADER_SOURCE).toContain('pow(contraction,progress*64.)');
        expect(PARAMETER_SCHEMA.find(({ key }) => key === 'godRaysSamples')).toMatchObject({
            min: 1,
            max: 128,
            default: 64,
        });
        expect(PARAMETER_SCHEMA.find(({ key }) => key === 'godRaysRenderScale')).toMatchObject({
            label: 'Render scale',
            min: 0.25,
            max: 1,
            step: 0.25,
            default: 1,
        });
        expect(PARAMETER_SCHEMA.find(({ key }) => key === 'godRaysFalloff')).toMatchObject({
            min: 0,
            max: 16,
            default: 4,
        });
        expect(POST_EFFECT_SHADER_SOURCE).toContain(
            'let travel=(uv-q)*vec2f(u.resolution.x/u.resolution.y,1.);let attenuation=1./(1.+p(106)*dot(travel,travel)*16.)',
        );
        expect(POST_EFFECT_SHADER_SOURCE).toContain('*attenuation');
        expect(GOD_RAYS_SHADER_SOURCE).toContain('for(var i=0u;i<128u;i++)');
        expect(GOD_RAYS_SHADER_SOURCE).toContain('center+(startUv-center)');
        expect(GOD_RAYS_SHADER_SOURCE).toContain('textureSampleLevel(src,samp,uv,0.)');
        expect(GOD_RAYS_SHADER_SOURCE).toContain('let rgb=textureSampleLevel(src,samp,uv,0.).rgb');
        expect(GOD_RAYS_SHADER_SOURCE).not.toContain('textureSample(src,samp,uv)');
        expect(GOD_RAYS_TEXTURE_FORMAT).toBe('rgba16float');
        expect(GOD_RAYS_SHADER_SOURCE).toContain('var sum=vec3f(0)');
        expect(GOD_RAYS_SHADER_SOURCE).toContain('sum+=rgb*weight');
        expect(GOD_RAYS_SHADER_SOURCE).not.toContain('adjustmentLut');
        expect(GOD_RAYS_SHADER_SOURCE).toContain('threshold<=0.');
        expect(DISPLAY_SHADER_SOURCE).toContain('textureSample(godRays,samp,uv).rgb');
        expect(DISPLAY_SHADER_SOURCE).not.toContain('vec3f(1),textureSample(godRays');
        expect(BLOOM_EXTRACT_SHADER_SOURCE).toContain('textureSample(godRays,samp,uv).rgb');
        expect(BLOOM_EXTRACT_SHADER_SOURCE).not.toContain('max(rays.r,max(rays.g,rays.b))');

        const parameters = defaultParameters();
        expect(godRaysIsActive(parameters)).toBe(false);
        parameters.godRaysEnabled = 1;
        parameters.godRaysAmount = 50;
        parameters.godRaysIntensity = 1;
        expect(godRaysIsActive(parameters)).toBe(true);
        parameters.godRaysIntensity = 0;
        expect(godRaysIsActive(parameters)).toBe(false);
    });
    it('preserves adjusted scene RGB through bloom and glow', () => {
        expect(BLOOM_TEXTURE_FORMAT).toBe('rgba16float');
        expect(BLOOM_EXTRACT_SHADER_SOURCE).toContain('var adjustmentLut:texture_2d<f32>');
        expect(BLOOM_EXTRACT_SHADER_SOURCE.match(/textureLoad\(adjustmentLut/g)).toHaveLength(2);
        expect(BLOOM_EXTRACT_SHADER_SOURCE).toContain('rgb*=exp2(u.post[0].y)');
        expect(BLOOM_EXTRACT_SHADER_SOURCE).toContain('rgb=blendLayer(rgb,textureSample(godRays,samp,uv).rgb');
        expect(BLOOM_EXTRACT_SHADER_SOURCE).toContain('let luminance=dot(max(rgb');
        expect(BLOOM_EXTRACT_SHADER_SOURCE).toContain('return vec4f(rgb*weight,1)');
        expect(BLOOM_BLUR_SHADER_SOURCE).toContain('textureSample(src,samp,uv+o).rgb');
        expect(BLOOM_BLUR_SHADER_SOURCE).toContain('return vec4f(rgb*.25,1)');
        expect(DISPLAY_SHADER_SOURCE).toContain('bloomRgb=textureSample(bloom,samp,uv).rgb');
        expect(DISPLAY_SHADER_SOURCE).toContain('bloomRgb*u.post[5].x');
        expect(DISPLAY_SHADER_SOURCE).toContain('hueRotate(bloomRgb,u.post[6].x)*u.post[5].w');
        expect(DISPLAY_SHADER_SOURCE).toContain('if(h==0.) { return rgb; }');
        expect(DISPLAY_SHADER_SOURCE).not.toContain('hueColor');
        expect(DISPLAY_SHADER_SOURCE).not.toContain('var b=0.');
    });
    it('linearly interpolates the high-depth adjustment LUT in the existing display shader', () => {
        expect(DISPLAY_SHADER_SOURCE.match(/textureLoad\(adjustmentLut/g)).toHaveLength(2);
        expect(DISPLAY_SHADER_SOURCE).toContain('texture_2d<f32>');
        expect(DISPLAY_SHADER_SOURCE).toContain('let f=clamp(v,0.,1.)');
        expect(DISPLAY_SHADER_SOURCE).toContain('let p=f*4095.');
        expect(DISPLAY_SHADER_SOURCE).toContain('let hi=min(lo+1,4095)');
        expect(DISPLAY_SHADER_SOURCE).toContain('mix(textureLoad');
        expect(DISPLAY_SHADER_SOURCE).toContain('adjusted(sourceValue(redUv)).r');
        expect(DISPLAY_SHADER_SOURCE).toContain('adjusted(sourceValue(blueUv)).b');
        expect(DISPLAY_SHADER_SOURCE).toContain('let redCoefficient=distortion-dispersion*.552535');
        expect(DISPLAY_SHADER_SOURCE).toContain('let greenCoefficient=distortion');
        expect(DISPLAY_SHADER_SOURCE).toContain('let blueCoefficient=distortion+dispersion');
        expect(DISPLAY_SHADER_SOURCE).toContain(
            'let fit=1.+2.*max(0.,max(redCoefficient,max(greenCoefficient,blueCoefficient)))',
        );
        expect(DISPLAY_SHADER_SOURCE).toContain('coefficient*dot(centered,centered)');
        expect(DISPLAY_SHADER_SOURCE).toContain('fn blendLight');
        expect(DISPLAY_SHADER_SOURCE).toContain('u.post[8].x');
        expect(DISPLAY_SHADER_SOURCE).toContain('u.post[8].y');
        expect(DISPLAY_SHADER_SOURCE).toContain('u.post[8].z');
        expect(
            ['godRaysBlendMode', 'bloomBlendMode', 'glowBlendMode'].map(
                (key) => defaultParameters()[key as keyof ReturnType<typeof defaultParameters>],
            ),
        ).toEqual([0, 0, 0]);
        expect(DISPLAY_SHADER_SOURCE).not.toContain('f*255');
        expect(DISPLAY_SHADER_SOURCE).not.toContain('/255.');
        expect(DISPLAY_SHADER_SOURCE).toContain('if(u.blurRadii[1].w<=.5)');
        expect(DISPLAY_SHADER_SOURCE).not.toContain('textureSample(adjustmentLut');
    });
    it('uses a nonblocking per-frame two-query timing ring separate from sparse pass telemetry', () => {
        const source = AtmosphereRenderer.toString();
        expect(GPU_FRAME_TIMING_RING_SIZE).toBeGreaterThanOrEqual(3);
        expect(MAX_IN_FLIGHT_SUBMISSIONS).toBe(2);
        expect(GPU_TIMING_SAMPLE_INTERVAL).toBe(30);
        expect(source).toContain('acquireFrameTimingSlot');
        expect(source).toContain('beginComputePass');
        expect(source).toContain('resolveQuerySet(this.frameTimingQuerySet');
        expect(source).toContain('sampleGpu(gpuMs');
        expect(source).toContain('sampleGpu(stats.totalMs');
        expect(source).toContain('lastFrameTimingAt');
        expect(source).toContain('lastGpuTimingEvidenceAt');
        expect(source).toContain('completedAt - submissionStartedAt');
        expect(source).toContain('submissionGeneration === this.adaptiveGeneration');
        expect(source).toContain('this.submissionsInFlight < MAX_IN_FLIGHT_SUBMISSIONS');
        expect(source).toContain('const hadOlderSubmission = this.submissionsInFlight > 0');
        expect(source).toContain('!hadOlderSubmission');
        expect(source).not.toContain('submissionPending');
        expect(source).not.toContain('adaptiveResolution.sample(dt');
        expect(source).toContain('frameInterval = 1e3 / 30');
        expect(source).toContain('now + 0.5 < this.nextRenderAt');
        expect(source).toContain('slot.resolve.destroy()');
        expect(source).toContain('slot.readback.destroy()');
    });
    it('allocates cursor uniform bindings with WGSL vec3 alignment', () => {
        expect(CURSOR_DENSITY_UNIFORM_BYTES).toBe(32);
        const source = AtmosphereRenderer.toString();
        expect(source.match(/size: CURSOR_DENSITY_UNIFORM_BYTES/g)).toHaveLength(2);
    });
    it('converts top-left cursor coordinates to WebGPU clip-space Y', () => {
        expect(CURSOR_PAINT_SHADER_SOURCE).toContain('vec4f(q.x/params.aspect,-q.y,0,1)');
    });
    it('renders one full-resolution frozen pause frame and restores adaptive rendering', () => {
        const source = AtmosphereRenderer.toString();
        expect(source).toContain('this.paused ? this.options.renderScale : this.adaptiveResolution.effectiveScale');
        expect(source).toContain('if (value === this.paused) return');
        expect(source).toContain('this.recreateTargets(value)');
        expect(source).toContain('if (!preserveHistory) this.historyTexture?.destroy()');
        expect(source).toContain('if (postRan && !this.paused && this.historyTexture)');
        expect(source).toContain('this.renderedFrames += 1');
        expect(source).toContain('const frameTimingSlot = this.paused ?');
        expect(source).toContain('!this.paused && this.querySet');
    });
    it('derives individual pass durations from sequential completion timestamps', () => {
        const stats = aggregateGpuTimestamps(
            [0n, 2_000_000n, 0n, 8_000_000n, 0n, 21_000_000n, 0n, 22_400_000n],
            ['base', 'blur2', 'octave2', 'display'],
        );
        expect(stats).toMatchObject({ totalMs: 22.4, baseMs: 2, blurMs: 6, octaveMs: 13, displayMs: 1.4 });
        expect(stats.passes).toEqual([
            { label: 'base', ms: 2 },
            { label: 'blur2', ms: 6 },
            { label: 'octave2', ms: 13 },
            { label: 'display', ms: 1.4 },
        ]);
        expect(GPU_TIMING_SAMPLE_INTERVAL).toBe(30);
    });
    it('turns malformed or decreasing GPU timestamp pairs into safe zero deltas', () => {
        expect(aggregateGpuTimestamps([5n, 4n, 1n], ['base', 'display']).passes).toEqual([
            { label: 'base', ms: 0 },
            { label: 'display', ms: 0 },
        ]);
    });
    it('creates fresh complete settings for reset-to-defaults', () => {
        const first = defaultShaderSettings();
        const second = defaultShaderSettings();
        expect(first.seed).toBe(defaultSettingsFixture.settings.seed);
        expect(first.parameters).toMatchObject(defaultSettingsFixture.settings.parameters);
        expect(first.colour).toHaveLength(defaultSettingsFixture.settings.colour.length);
        expect(first.colour).not.toBe(second.colour);
        first.parameters.fieldScale = 32;
        expect(second.parameters.fieldScale).toBe(defaultSettingsFixture.settings.parameters.fieldScale);
    });
    it('uses seeded 3D simplex gradients instead of synchronized Z-slice interpolation', () => {
        expect(COMMON_SHADER_SOURCE).toContain('fn simplexGradient');
        expect(COMMON_SHADER_SOURCE).toContain('fn simplexCorner');
        expect(COMMON_SHADER_SOURCE).toContain('kernel*kernel*kernel*kernel');
        expect(COMMON_SHADER_SOURCE).not.toContain('mix(z0,z1,f.z)');
    });
    it('uses separate salted simplex fields for each remaining cloud and ribbon', () => {
        expect(COMMON_SHADER_SOURCE).toContain('fn hash3(p: vec3f, seedSalt: f32)');
        expect(COMMON_SHADER_SOURCE).toContain('u.seed*19.19 + seedSalt*53.17');
        expect(COMMON_SHADER_SOURCE).toContain('hash3(lattice,seedSalt)');

        const fieldSamples = [
            'noise3(primaryPosition,307.)',
            'noise3(primaryPosition,401.)',
            'noise3(secondaryPosition,503.)',
            'noise3(secondaryPosition,601.)',
        ];
        fieldSamples.forEach((sample) => expect(BASE_SHADER_SOURCE).toContain(sample));
        expect(new Set(fieldSamples.map((sample) => sample.match(/,(\d+)\./)?.[1])).size).toBe(4);
        expect(BASE_SHADER_SOURCE).not.toContain('tertiary');
    });
    it('caps DPR and rounds down to stable physical dimensions', () => {
        expect(renderSize(801.9, 600.8, 3, 1.5)).toEqual({ width: 1202, height: 901 });
        expect(renderSize(801.9, 600.8, 3, Number.POSITIVE_INFINITY)).toEqual({ width: 2405, height: 1802 });
        expect(renderSize(0, 0, 2, 1)).toEqual({ width: 1, height: 1 });
    });
    it('keeps scaled render targets valid', () => {
        expect(scaledSize(1202, 901, 0.5)).toEqual({ width: 601, height: 450 });
        expect(scaledSize(0, 0, 0.5)).toEqual({ width: 1, height: 1 });
    });
    it('keeps the base and all five octave effect stages full resolution', () => {
        expect(OCTAVE_COUNT).toBe(5);
        expect(octavePixelSizes()).toEqual([16, 8, 4, 2, 1]);
        expect(fullResolutionPassSizes(1202, 901, 1)).toEqual(
            Array.from({ length: 6 }, () => ({ width: 1202, height: 901 })),
        );
        expect(fullResolutionPassSizes(1202, 901, 0.5)).toEqual(
            Array.from({ length: 6 }, () => ({ width: 601, height: 450 })),
        );
    });
    it('changes evolution rate without changing the current phase', () => {
        expect(advanceSimulationTime(12, 0, 3)).toBe(12);
        expect(advanceSimulationTime(12, 0.5, 1)).toBe(12.5);
        expect(advanceSimulationTime(12, 0.5, 3)).toBe(13.5);
    });
    it('defines five independent groups of four valid controls', () => {
        expect(FIELD_PARAMETER_SCHEMA).toHaveLength(25);
        expect(OCTAVE_PARAMETER_SCHEMA).toHaveLength(5);
        OCTAVE_PARAMETER_SCHEMA.forEach((group) => expect(group).toHaveLength(4));
        expect(OCTAVE_PIXELATE_SCHEMA).toHaveLength(5);
        expect(OCTAVE_BLUR_SCHEMA).toHaveLength(5);
        expect(PARAMETER_SCHEMA).toHaveLength(171);
        expect(new Set(PARAMETER_SCHEMA.map(({ key }) => key)).size).toBe(PARAMETER_SCHEMA.length);
        for (const parameter of PARAMETER_SCHEMA) {
            expect(parameter.min).toBeLessThan(parameter.max);
            expect(parameter.step).toBeGreaterThan(0);
            expect(parameter.default).toBeGreaterThanOrEqual(parameter.min);
            expect(parameter.default).toBeLessThanOrEqual(parameter.max);
            expect(defaultParameters()[parameter.key]).toBe(parameter.default);
        }
        expect(defaultParameters().thresholdEnabled).toBe(1);
        expect(defaultParameters()).toEqual(
            Object.fromEntries(PARAMETER_SCHEMA.map(({ key, default: value }) => [key, value])),
        );
        for (const key of ['billowAmount', 'ridgeAmount', 'secondaryCloudAmount', 'secondaryRibbonAmount'] as const) {
            expect(FIELD_PARAMETER_SCHEMA.find((parameter) => parameter.key === key)?.min).toBe(-2);
        }
        expect(OCTAVE_PARAMETER_SCHEMA.map((group) => group[0].default)).toEqual([0, 0.005, 0.01, 0.01, 0.005]);
        expect(OCTAVE_PARAMETER_SCHEMA.map((group) => group[1].default)).toEqual(Array(5).fill(0));
        expect(OCTAVE_PARAMETER_SCHEMA.map((group) => group[2].default)).toEqual([0.85, 1, 1, 0.67, 0]);
        expect(OCTAVE_PARAMETER_SCHEMA.map((group) => group[3].default)).toEqual([0, 0, 0.3, 0.5, 1.8]);
        expect(OCTAVE_PIXELATE_SCHEMA.map(({ default: value }) => value)).toEqual(Array(5).fill(0));
        expect(OCTAVE_BLUR_SCHEMA.map(({ default: value }) => value)).toEqual(
            OCTAVE_BLUR_SCHEMA.map(({ key }) => defaultSettingsFixture.settings.parameters[key]),
        );
    });
    it('ignores stale persisted sixth and seventh octave keys', () => {
        const saved = {
            ...defaultParameters(),
            octave6Noise: 0.4,
            octave7Pixelate: 1,
        } as ReturnType<typeof defaultParameters>;
        const normalized = normalizeSavedSettings({ seed: 7, parameters: saved });
        expect('octave6Noise' in normalized.parameters).toBe(false);
        expect('octave7Pixelate' in normalized.parameters).toBe(false);
    });
    it('ignores stale persisted tertiary keys while preserving remaining settings', () => {
        const saved = {
            ...defaultParameters(),
            secondaryScale: 2.25,
            tertiaryEnabled: 1,
            tertiaryScale: 4.5,
            tertiaryCloudAmount: 1.2,
            tertiaryRibbonAmount: -0.8,
            tertiaryRibbonSharpness: 3,
            tertiaryBlendMode: 2,
        } as ReturnType<typeof defaultParameters>;
        const normalized = normalizeSavedSettings({ seed: 7, parameters: saved });
        expect(normalized.parameters.secondaryScale).toBe(2);
        expect(Object.keys(normalized.parameters).some((key) => key.startsWith('tertiary'))).toBe(false);
    });
    it('uses current defaults for missing saved settings and normalizes categorical modes', () => {
        const old = normalizeSavedSettings({ seed: 7, parameters: {} as ReturnType<typeof defaultParameters> });
        expect(old.parameters.baseBlendMode).toBe(3);
        expect(old.parameters.secondaryBlendMode).toBe(0);
        expect(old.parameters.secondaryRibbonBlendMode).toBe(1);
        expect(old.parameters.temperature).toBe(defaultSettingsFixture.settings.parameters.temperature);

        const migratedNeutral = normalizeSavedSettings({
            seed: 7,
            parameters: { ...defaultParameters(), temperature: 0 },
        });
        const migratedWarm = normalizeSavedSettings({
            seed: 7,
            parameters: { ...defaultParameters(), temperature: 1 },
        });
        const migratedCool = normalizeSavedSettings({
            seed: 7,
            parameters: { ...defaultParameters(), temperature: -1 },
        });
        expect(migratedNeutral.parameters.temperature).toBe(6500);
        expect(migratedWarm.parameters.temperature).toBe(8500);
        expect(migratedCool.parameters.temperature).toBe(4500);

        const parameters = defaultParameters();
        parameters.baseBlendMode = 1.6;
        parameters.secondaryBlendMode = -4;
        parameters.glowBlendMode = 99;
        const normalized = normalizeSavedSettings({ seed: 7, parameters });
        expect([
            normalized.parameters.baseBlendMode,
            normalized.parameters.secondaryBlendMode,
            normalized.parameters.glowBlendMode,
        ]).toEqual([2, 0, 14]);
    });
    it('packs the aligned uniform header and array<vec4f, 5>', () => {
        const parameters = defaultParameters();
        parameters.octave1Pixelate = 1;
        parameters.octave3Pixelate = 1;
        const data = packUniform([320, 180], 2, 9, parameters, 4, 73);
        expect(data).toHaveLength(UNIFORM_FLOATS);
        expect(data.byteLength).toBe(UNIFORM_FLOATS * 4);
        expect(Array.from(data.slice(12, 18))).toEqual(Array.from(new Float32Array([1, 0.45, 0.15, 1, 4, 0])));
        expect(data[29]).toBe(4);
        expect(data[30]).toBe(5);
        expect(data[31]).toBe(73);
        expect(Array.from(data.slice(32, 36))).toEqual(
            Array.from(
                new Float32Array([
                    parameters.octave1Noise,
                    parameters.octave1Threshold,
                    parameters.octave1Smoothness,
                    parameters.octave1Distance,
                ]),
            ),
        );
        expect(Array.from(data.slice(52, 57))).toEqual(
            Array.from(new Float32Array(OCTAVE_BLUR_SCHEMA.map(({ key }) => parameters[key]))),
        );
        expect(Array.from(data.slice(57, 60))).toEqual([0, 0, 0]);
    });
    it('uses a dynamic radius and four diagonal samples with an exact zero-radius identity', () => {
        expect(BLUR_SHADER_SOURCE).toContain('exp2(4.-u.octaveIndex)');
        expect(BLUR_SHADER_SOURCE).toContain('u.blurRadii[radiusIndex/4u][radiusIndex%4u]');
        expect(BLUR_SHADER_SOURCE).toContain('if(radius<=0.)');
        expect(BLUR_SHADER_SOURCE.match(/textureSample\(/g)).toHaveLength(5);
    });
    it('skips neutral octave work while smoothness alone remains neutral', () => {
        const parameters = defaultParameters();
        parameters.octave1Noise = 0;
        parameters.octave1Distance = 0;
        expect(octaveEffectIsActive(parameters, 0)).toBe(false);
        parameters.octave1Smoothness = 1;
        expect(octaveEffectIsActive(parameters, 0)).toBe(false);
        for (const key of ['octave1Noise', 'octave1Threshold', 'octave1Distance', 'octave1Pixelate'] as const) {
            const active = { ...parameters, [key]: key === 'octave1Threshold' ? -0.1 : 1 };
            expect(octaveEffectIsActive(active, 0)).toBe(true);
        }
        expect(octaveBlurIsActive(parameters, 0)).toBe(false);
        parameters.octave1BlurRadius = 0.1;
        expect(octaveBlurIsActive(parameters, 0)).toBe(true);
        parameters.octave1BlurRadius = 0;
        parameters.octave1BlurRadius = 0.00001;
        expect(octaveBlurIsActive(parameters, 0)).toBe(true);
        parameters.octave1Threshold = 0.00001;
        expect(octaveEffectIsActive(parameters, 0)).toBe(true);
    });
    it('keeps persisted blend enums stable and implements every appended mode', () => {
        expect(FIELD_BLEND_MODES.slice(0, 4)).toEqual(['Add', 'Subtract', 'Screen', 'Overlay']);
        expect(POST_BLEND_MODES.slice(0, 4)).toEqual(['Add', 'Screen', 'Overlay', 'Soft light']);
        expect(FIELD_BLEND_MODES).toHaveLength(15);
        expect(POST_BLEND_MODES).toHaveLength(15);
        expect(FIELD_BLEND_MODES).toEqual(
            expect.arrayContaining([
                'Multiply',
                'Difference',
                'Negation',
                'Exclusion',
                'Darken',
                'Lighten',
                'Color dodge',
                'Color burn',
                'Hard light',
                'Soft light',
                'Divide',
            ]),
        );
        expect(POST_BLEND_MODES).toEqual(
            expect.arrayContaining([
                'Multiply',
                'Difference',
                'Negation',
                'Exclusion',
                'Darken',
                'Lighten',
                'Color dodge',
                'Color burn',
                'Hard light',
                'Subtract',
                'Divide',
            ]),
        );
        for (const key of ['baseBlendMode', 'secondaryBlendMode', 'secondaryRibbonBlendMode'])
            expect(FIELD_PARAMETER_SCHEMA.find((parameter) => parameter.key === key)).toMatchObject({
                min: 0,
                max: 14,
            });
        for (const key of ['godRaysBlendMode', 'bloomBlendMode', 'glowBlendMode'])
            expect(POST_PARAMETER_SCHEMA.find((parameter) => parameter.key === key)).toMatchObject({ min: 0, max: 14 });
        expect(COMMON_SHADER_SOURCE).toContain('if(mode<1.5) { return backdrop-source; }');
        expect(COMMON_SHADER_SOURCE).toContain('fn extendedBlend01');
        expect(COMMON_SHADER_SOURCE).toContain('max(1.-b,.00001)');
        expect(COMMON_SHADER_SOURCE).toContain('a/max(b,.00001)');
        expect(DISPLAY_SHADER_SOURCE).toContain('fn extendedLightChannel');
        expect(DISPLAY_SHADER_SOURCE).toContain('if(mode<13.5) { return a-b; }');
        expect(DISPLAY_SHADER_SOURCE).toContain('if(strength<=0.) { return base; }');
        expect(BLOOM_EXTRACT_SHADER_SOURCE).toContain('fn extendedLightChannel');
        expect(POST_EFFECT_SHADER_SOURCE).toContain('fn extendedLightChannel');
        expect(POST_EFFECT_SHADER_SOURCE).toContain('if(mode<13.5){return a-b;}');
        expect(POST_EFFECT_SHADER_SOURCE).toContain('return select(1.,a/max(b,.00001),b>0.)');
        expect(POST_EFFECT_SHADER_SOURCE).toContain('if(strength<=0.){return base;}');
        expect(POST_EFFECT_SHADER_SOURCE).not.toContain('return mix(base,layer');
    });
    it('preserves the base generator blend while compositing secondary ribbon independently', () => {
        expect(BASE_SHADER_SOURCE).toContain('fn screen01');
        expect(BASE_SHADER_SOURCE).toContain('fn overlay01');
        expect(BASE_SHADER_SOURCE).toContain('fn blendSigned');
        expect(BASE_SHADER_SOURCE).toContain('shaped=blendSigned(shaped,ribbon*u.ridgeAmount,u.baseBlendMode)');
        expect(BASE_SHADER_SOURCE).toContain(
            'natural=blendSigned(natural,secondaryCloud*u.secondaryCloudAmount,u.secondaryBlendMode)',
        );
        expect(BASE_SHADER_SOURCE).toContain(
            'natural=blendSigned(natural,secondaryRibbon*u.secondaryRibbonAmount,u.secondaryRibbonBlendMode)',
        );
        expect(BASE_SHADER_SOURCE).not.toContain('secondaryShaped');
        expect(BASE_SHADER_SOURCE).toContain(
            'if(u.secondaryEnabled>=.5 && (u.secondaryCloudAmount!=0. || u.secondaryRibbonAmount!=0.))',
        );
        expect(BASE_SHADER_SOURCE).toContain('fn smoothAbsFold');
        expect(BASE_SHADER_SOURCE.indexOf('natural=blendSigned')).toBeLessThan(
            BASE_SHADER_SOURCE.indexOf('natural*=exp2'),
        );
    });
    it('uses exact zero guards for blending and generator sources', () => {
        expect(COMMON_SHADER_SOURCE).toContain('if(source==0.) { return backdrop; }');
        for (const guard of [
            'if(u.billowAmount!=0.)',
            'if(u.ridgeAmount!=0.)',
            'if(u.secondaryCloudAmount!=0.)',
            'if(u.secondaryRibbonAmount!=0.)',
        ]) {
            expect(BASE_SHADER_SOURCE).toContain(guard);
        }
    });
    it('uses only the applied warp offset for primary and secondary positions', () => {
        expect(BASE_SHADER_SOURCE).toContain(
            'let fieldHasAmount=u.billowAmount!=0. || u.ridgeAmount!=0. || secondaryHasAmount',
        );
        expect(BASE_SHADER_SOURCE).toContain('if(fieldHasAmount && u.warpStrength!=0.)');
        expect(BASE_SHADER_SOURCE).toContain('warpOffset=(noise3v(flow*u.warpScale,t*.11)-.5)*u.warpStrength');
        expect(BASE_SHADER_SOURCE).toContain('let p=flow+warpOffset');
        expect(BASE_SHADER_SOURCE).toContain('-warpOffset*.41');
        expect(BASE_SHADER_SOURCE).not.toContain('let drift=');
        expect(BASE_SHADER_SOURCE).not.toMatch(/-drift|drift\*u\.warpStrength/);
    });
    it('uses exact zero threshold and diffusion bypasses in the octave shader', () => {
        expect(OCTAVE_SHADER_SOURCE).toContain('if(settings.w>0.)');
        expect(OCTAVE_SHADER_SOURCE).toContain('if(settings.y==0.) { return vec4f(injected,1.); }');
        expect(OCTAVE_SHADER_SOURCE.indexOf('if(settings.y==0.)')).toBeLessThan(
            OCTAVE_SHADER_SOURCE.indexOf('fwidth(luminance)'),
        );
        expect(OCTAVE_SHADER_SOURCE).not.toContain('abs(settings.y)>.001');
        expect(OCTAVE_SHADER_SOURCE).toContain('var scattered: vec3f;');
        expect(OCTAVE_SHADER_SOURCE).toContain('} else {\n        scattered=textureSample(src,samp,sourceUv).rgb;');
        expect(OCTAVE_SHADER_SOURCE).toContain('thresholded/max(luminance,.000001)');
        expect(OCTAVE_SHADER_SOURCE).not.toContain('var scattered=textureSample');
    });
    it('uses exact integer octave tiling and pixelation bits', () => {
        expect(OCTAVE_SHADER_SOURCE).toContain('let octave=u32(u.octaveIndex)');
        expect(OCTAVE_SHADER_SOURCE).toContain('let pixel=vec2u(pos.xy)');
        expect(OCTAVE_SHADER_SOURCE).toContain('let tileShift=4u-octave');
        expect(OCTAVE_SHADER_SOURCE).toContain('let octavePixelSizeU=1u<<tileShift');
        expect(OCTAVE_SHADER_SOURCE).toContain('let tile=pixel>>vec2u(tileShift)');
        expect(OCTAVE_SHADER_SOURCE).toContain('(u32(u.octavePixelationMask)&(1u<<octave))!=0u');
        expect(OCTAVE_SHADER_SOURCE).not.toContain('floor(pixel/octavePixelSize)');
    });
    it('uses fast frame-varying scatter and tile noise', () => {
        expect(OCTAVE_SHADER_SOURCE).toContain('fn avalanche(value: u32)');
        expect(OCTAVE_SHADER_SOURCE).toContain(
            '(tile.x*0x9e3779b9u) ^ (tile.y*0x85ebca6bu) ^ (u32(u.seed)*0xc2b2ae35u)',
        );
        expect(OCTAVE_SHADER_SOURCE).toContain('octaveFrameSalt ^ (sampleIndex*0x165667b1u)');
        expect(OCTAVE_SHADER_SOURCE).toContain('(u32(u.frameIndex)*0x9e3779b9u)');
        expect(OCTAVE_SHADER_SOURCE).toContain('array<vec2f,16>');
        expect(OCTAVE_SHADER_SOURCE).toContain('sampleIndex<4u');
        expect(OCTAVE_SHADER_SOURCE).toContain('mix(1.,4.,settings.z)');
        expect(OCTAVE_SHADER_SOURCE).toContain('u32(u.frameIndex)');
        expect(OCTAVE_SHADER_SOURCE.match(/u\.frameIndex/g)).toHaveLength(2);
        expect(OCTAVE_SHADER_SOURCE).toContain('if(settings.x!=0.)');
        expect(OCTAVE_SHADER_SOURCE).not.toContain('cos(');
        expect(OCTAVE_SHADER_SOURCE).not.toContain('sin(angle)');
        expect(OCTAVE_SHADER_SOURCE).not.toContain('hash(pixel');
    });
    it('keys cached bind groups by pipeline, source, and independent uniform slot', () => {
        expect(bindGroupCacheKey(2, 0, 3)).toBe('2:0:3');
        expect(bindGroupCacheKey(2, 1, 3)).not.toBe(bindGroupCacheKey(2, 0, 3));
        expect(bindGroupCacheKey(0, undefined, 0)).toBe('0:none:0');
    });
    it('can bypass the stage-one threshold to expose the raw field', () => {
        expect(BASE_SHADER_SOURCE).toContain('if(u.thresholdEnabled<.5) { return vec4f(natural,0.,0.,1.); }');
    });
    it('appends and packs independent lens and camera toggles without moving existing post uniforms', () => {
        const toggleKeys = [
            'chromaticAberrationEnabled',
            'vignetteEnabled',
            'lensDistortionEnabled',
            'sharpenEnabled',
            'filmGrainEnabled',
        ] as const;
        expect(POST_PARAMETER_SCHEMA).toHaveLength(108);
        expect(POST_PARAMETER_SCHEMA.slice(35, 40).map(({ key }) => key)).toEqual(toggleKeys);
        expect(POST_PARAMETER_SCHEMA.slice(35, 40).every(({ default: value }) => value === 1)).toBe(true);
        const parameters = defaultParameters();
        toggleKeys.forEach((key, index) => (parameters[key] = index + 10));
        const packed = packUniform([1, 1], 0, 0, parameters);
        expect(packed).toHaveLength(UNIFORM_FLOATS);
        expect(Array.from(packed.slice(95, 100))).toEqual([10, 11, 12, 13, 14]);
        expect(COMMON_SHADER_SOURCE).toContain('post: array<vec4f, 30>');
    });
    it('gates every lens and camera effect before its sampling or math', () => {
        expect(DISPLAY_SHADER_SOURCE).toContain(
            'let distortionEnabled=u.post[9].y>.5 && u.post[7].x!=0.; let dispersionEnabled=u.post[8].w>.5 && u.post[6].y!=0.;',
        );
        expect(DISPLAY_SHADER_SOURCE).toContain('if(distortionEnabled || dispersionEnabled)');
        expect(DISPLAY_SHADER_SOURCE).toContain('if(u.post[9].z>.5 && u.post[7].y!=0.)');
        expect(DISPLAY_SHADER_SOURCE).toContain('if(u.post[9].x>.5 && u.post[6].z!=0.)');
        expect(DISPLAY_SHADER_SOURCE).toContain('if(u.post[9].w>.5 && u.post[7].z!=0.)');
        expect(DISPLAY_SHADER_SOURCE).toContain('if(dispersionEnabled)');
    });
});
