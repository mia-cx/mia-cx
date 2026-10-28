/**
 * The field's debug panel state (press M on a page with the field). Every value persists in this
 * browser, so tuned settings survive reloads and apply whether or not the panel is open.
 */
import { persistentAtom } from '@nanostores/persistent';
import { BAKED_RENDER_OPTIONS } from './baked-settings';
import { CALM_DEFAULTS, TEXEL, type CalmSettings } from './calm-mask';

/** A JSON store that fills in keys added to its defaults since the value was saved. */
const stored = <T extends object>(key: string, defaults: T) =>
    persistentAtom<T>(key, defaults, {
        encode: JSON.stringify,
        decode: (value) => ({ ...defaults, ...JSON.parse(value) }),
    });

export const calmSettings = stored<CalmSettings>('atmosphere:calm:v1', CALM_DEFAULTS);
export const CALM_CONTROLS = [
    { key: 'radius', label: 'Radius', min: 0, max: 128, step: 1 },
    { key: 'feather', label: 'Feather', min: 0, max: 128, step: 1 },
    { key: 'exponent', label: 'Exponent', min: 0.1, max: 6, step: 0.05 },
    { key: 'strength', label: 'Strength', min: 0, max: 1, step: 0.01 },
] as const;

/**
 * The field's built-in centre darkening, a superellipse. Ranges match FIELD_PARAMETER_SCHEMA,
 * restated so the renderer module stays lazily loaded.
 */
export const CENTRE_CONTROLS = [
    { key: 'centerDarkness', label: 'Darkness', min: 0, max: 1.5, step: 0.01 },
    { key: 'centerWidth', label: 'Width', min: 0.1, max: 2.5, step: 0.01 },
    { key: 'centerHeight', label: 'Height', min: 0.1, max: 2.5, step: 0.01 },
    { key: 'centerRoundness', label: 'Roundness', min: 2, max: 12, step: 0.1 },
    { key: 'centerSoftness', label: 'Softness', min: 0.01, max: 1.5, step: 0.01 },
] as const;
export type CentreSettings = Record<(typeof CENTRE_CONTROLS)[number]['key'], number>;
const CENTRE_DEFAULTS = Object.fromEntries(
    CENTRE_CONTROLS.map(({ key }) => [key, BAKED_RENDER_OPTIONS.parameters[key]]),
) as CentreSettings;
export const centreSettings = stored<CentreSettings>('atmosphere:centre:v1', CENTRE_DEFAULTS);
/** Switches the centre darkening off, to judge the calm mask on its own. */
export const centreEnabled = persistentAtom<boolean>('atmosphere:centre-enabled:v1', true, {
    encode: JSON.stringify,
    decode: JSON.parse,
});

/** Which darkening masks the panel draws over the page. */
export const overlays = stored('atmosphere:overlays:v1', { calm: true, centre: true });

/** A field paused from the panel: its seed and clock, so the same frame comes back on reload. */
export const frozenField = persistentAtom<{ seed: number; time: number } | undefined>(
    'atmosphere:frozen:v1',
    undefined,
    {
        encode: JSON.stringify,
        decode: JSON.parse,
        // Another tab pausing has its own seed; this one keeps running.
        listen: false,
    },
);

/** Back to the code defaults for everything but a paused frame. */
export function resetFieldDebug() {
    calmSettings.set(CALM_DEFAULTS);
    centreSettings.set(CENTRE_DEFAULTS);
    centreEnabled.set(true);
    overlays.set({ calm: true, centre: true });
}

/** Overlay colour for the centre darkening, apart from the calm mask's green. */
const CENTRE_TINT = [255, 214, 0] as const;
const drawn = new WeakMap<HTMLCanvasElement, string>();

/**
 * Draws the share of light the centre darkening takes away, with the field shader's own formula,
 * at calm-mask resolution. Pass a darkness of 0 when it is switched off.
 */
export function drawCentreMask(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number, centre: CentreSettings) {
    const width = Math.max(1, Math.ceil(cssWidth / TEXEL)),
        height = Math.max(1, Math.ceil(cssHeight / TEXEL));
    const signature = `${width}x${height}:${cssWidth / cssHeight}:${Object.values(centre)}`;
    if (drawn.get(canvas) === signature) return;
    drawn.set(canvas, signature);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(width, height),
        pixels = image.data;
    const aspect = cssWidth / cssHeight,
        roundness = centre.centerRoundness,
        feather = centre.centerSoftness * 0.5;
    const smoothstep = (edge0: number, edge1: number, x: number) => {
        const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    };
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const qx = Math.abs((((x + 0.5) / width) * 2 - 1) * aspect) / centre.centerWidth,
                qy = Math.abs(((y + 0.5) / height) * 2 - 1) / centre.centerHeight;
            const distance = (qx ** roundness + qy ** roundness) ** (1 / roundness);
            const inside = 1 - smoothstep(1 - feather, 1 + feather, distance);
            const i = (y * width + x) * 4;
            pixels.set(CENTRE_TINT, i);
            pixels[i + 3] = 255 * (1 - 2 ** (-inside * centre.centerDarkness * 4));
        }
    context.putImageData(image, 0, 0);
}
