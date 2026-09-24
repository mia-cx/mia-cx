import defaultSettingsFixture from './default-settings.json';
import type { RenderOptions, ShaderParameters } from './renderer';
import { BAKED_POST_PARAMETERS, BAKED_POST_PLAN } from './baked-post-plan.generated';
import { leadingAdjustmentRegion, type ColourEffect, type PostEffect } from './pipeline';

/** Canonical build-time configuration: no persistence, migration, normalization, or asset lookup. */
const settings = defaultSettingsFixture.settings as unknown as {
    seed: number;
    parameters: ShaderParameters;
    colour: ColourEffect[];
    post: PostEffect[];
};

const leading = leadingAdjustmentRegion(settings.colour);
export const BAKED_RENDER_OPTIONS: RenderOptions = {
    seed: settings.seed,
    dprCap: Number.POSITIVE_INFINITY,
    renderScale: 1,
    parameters: settings.parameters,
    colour: settings.colour,
    post: settings.post,
    bakedPostPlan: BAKED_POST_PLAN as RenderOptions['bakedPostPlan'],
    bakedPostParameters: Float32Array.from(BAKED_POST_PARAMETERS),
    bakedLeadingAdjustments: leading,
};

/** Load generated binary data without numeric-JS bloat or startup composition work. */
export async function loadBakedRenderOptions(fetcher: typeof fetch = fetch): Promise<RenderOptions> {
    const response = await fetcher('/baked-adjustment-lut.bin');
    if (!response.ok) throw new Error(`Could not load baked adjustment LUT (${response.status}).`);
    return { ...BAKED_RENDER_OPTIONS, bakedAdjustmentLut: new Uint16Array(await response.arrayBuffer()) };
}
