export const MAX_ADJUSTMENTS = 128;
export const MAX_CURVE_POINTS = 256;
/** Edge length of the renderer's high-depth RGB adjustment cube. */
export const ADJUSTMENT_LUT_SIZE = 33;
export const CHANNELS = ['r', 'g', 'b'] as const;
export type Channel = (typeof CHANNELS)[number];
export const HSL_CHANNELS = ['h', 's', 'l'] as const;
export type HslChannel = (typeof HSL_CHANNELS)[number];
export type CurveChannel = Channel | HslChannel;

export interface CurvePoint {
    x: number;
    y: number;
}
export interface LevelsChannel {
    inputLow: number;
    inputHigh: number;
    gamma: number;
    outputLow: number;
    outputHigh: number;
}
export type CurveChannels = Record<Channel, CurvePoint[]>;
export type HslCurveChannels = Record<HslChannel, CurvePoint[]>;
export type LevelsChannels = Record<Channel, LevelsChannel>;
interface AdjustmentBase {
    id: string;
    enabled: boolean;
}
export interface RgbCurveAdjustment extends AdjustmentBase {
    type: 'curve';
    mode: 'rgb';
    channels: CurveChannels;
}
export interface HslCurveAdjustment extends AdjustmentBase {
    type: 'curve';
    mode: 'hsl';
    channels: HslCurveChannels;
}
export type CurveAdjustment = RgbCurveAdjustment | HslCurveAdjustment;
export interface LevelsAdjustment extends AdjustmentBase {
    type: 'levels';
    channels: LevelsChannels;
}
export interface HslAdjustment extends AdjustmentBase {
    type: 'hsl';
    hue: number;
    saturation: number;
    lightness: number;
}
export type Adjustment = CurveAdjustment | LevelsAdjustment | HslAdjustment;
export type LevelsKey = keyof LevelsChannel;
export type CurveEdit =
    | { type: 'add'; x: number; y: number }
    | { type: 'move'; oldX: number; x: number; y: number }
    | { type: 'remove'; x: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finite = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const identityPoints = (): CurvePoint[] => [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
];
export const identityLevels = (): LevelsChannel => ({
    inputLow: 0,
    inputHigh: 255,
    gamma: 1,
    outputLow: 0,
    outputHigh: 255,
});
export const adjustmentId = () =>
    globalThis.crypto?.randomUUID?.() ?? `adjustment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const newCurve = (): RgbCurveAdjustment => ({
    id: adjustmentId(),
    type: 'curve',
    enabled: true,
    mode: 'rgb',
    channels: { r: identityPoints(), g: identityPoints(), b: identityPoints() },
});
export const newHslCurve = (): HslCurveAdjustment => ({
    id: adjustmentId(),
    type: 'curve',
    mode: 'hsl',
    enabled: true,
    channels: { h: identityPoints(), s: identityPoints(), l: identityPoints() },
});

/** Reinterpret the three curve paths in the requested color space without losing edits. */
export function setCurveMode(curve: CurveAdjustment, mode: 'rgb'): RgbCurveAdjustment;
export function setCurveMode(curve: CurveAdjustment, mode: 'hsl'): HslCurveAdjustment;
export function setCurveMode(curve: CurveAdjustment, mode: CurveAdjustment['mode']): CurveAdjustment;
export function setCurveMode(curve: CurveAdjustment, mode: CurveAdjustment['mode']): CurveAdjustment {
    if (curve.mode === mode) return curve;
    const source = curve.channels as Record<string, CurvePoint[]>;
    const copy = (channel: string) => source[channel].map((point) => ({ ...point }));
    return mode === 'rgb'
        ? { ...curve, mode, channels: { r: copy('h'), g: copy('s'), b: copy('l') } }
        : { ...curve, mode, channels: { h: copy('r'), s: copy('g'), l: copy('b') } };
}
export const newLevels = (): LevelsAdjustment => ({
    id: adjustmentId(),
    type: 'levels',
    enabled: true,
    channels: { r: identityLevels(), g: identityLevels(), b: identityLevels() },
});
export const newHslAdjustment = (): HslAdjustment => ({
    id: adjustmentId(),
    type: 'hsl',
    enabled: true,
    hue: 0,
    saturation: 100,
    lightness: 0,
});
export type HslAdjustmentKey = 'hue' | 'saturation' | 'lightness';
const HSL_RANGES: Record<HslAdjustmentKey, [number, number]> = {
    hue: [-180, 180],
    saturation: [0, 200],
    lightness: [-100, 100],
};
export function setHslAdjustmentValue(a: HslAdjustment, key: HslAdjustmentKey, raw: number): HslAdjustment {
    const [lo, hi] = HSL_RANGES[key];
    return { ...a, [key]: Math.round(clamp(finite(raw, a[key]), lo, hi)) };
}

/** Paint.NET's byte-quantized HueSaturationLightness pixel operation. */
export function applyHslAdjustment(a: HslAdjustment, rgb: [number, number, number]): [number, number, number] {
    if (!a.enabled || (a.hue === 0 && a.saturation === 100 && a.lightness === 0)) return [...rgb];
    const [r, g, b] = rgb,
        intensity = (7471 * b + 38470 * g + 19595 * r) >> 16,
        internalSaturation = a.saturation > 100 ? (a.saturation - 100) * 3 + 100 : a.saturation,
        satFactor = Math.trunc((internalSaturation * 1024) / 100),
        saturated = [r, g, b].map((c) => clamp((intensity * 1024 + (c - intensity) * satFactor) >> 10, 0, 255)) as [
            number,
            number,
            number,
        ],
        max = Math.max(...saturated),
        min = Math.min(...saturated),
        delta = max - min;
    let converted: number[] = saturated;
    if (a.hue !== 0) {
        let hue = 0;
        if (max !== 0 && delta !== 0) {
            hue =
                max === saturated[0]
                    ? (saturated[1] - saturated[2]) / delta
                    : max === saturated[1]
                      ? 2 + (saturated[2] - saturated[0]) / delta
                      : 4 + (saturated[0] - saturated[1]) / delta;
            hue *= 60;
            if (hue < 0) hue += 360;
        }
        let h = Math.trunc(hue) + a.hue;
        while (h < 0) h += 360;
        while (h > 360) h -= 360;
        const s = Math.trunc(max === 0 || delta === 0 ? 0 : (delta / max) * 100) / 100,
            v = Math.trunc((max / 255) * 100) / 100,
            sectorPos = (h % 360) / 60,
            sector = Math.floor(sectorPos),
            f = sectorPos - sector,
            p = v * (1 - s),
            q = v * (1 - s * f),
            t = v * (1 - s * (1 - f));
        converted = (
            s === 0
                ? [v, v, v]
                : sector === 0
                  ? [v, t, p]
                  : sector === 1
                    ? [q, v, p]
                    : sector === 2
                      ? [p, v, t]
                      : sector === 3
                        ? [p, q, v]
                        : sector === 4
                          ? [t, p, v]
                          : [v, p, q]
        ).map((c) => Math.trunc(c * 255));
    }
    if (a.lightness === 0) return converted as [number, number, number];
    const alpha = Math.floor((Math.abs(a.lightness) * 255) / 100),
        target = a.lightness > 0 ? 255 : 0;
    return converted.map((c) => Math.trunc((c * (255 - alpha) + target * alpha) / 256)) as [number, number, number];
}

/** Natural cubic spline matching OpenPDN Core/SplineInterpolator.cs (natural endpoints). */
export function interpolateNatural(points: CurvePoint[], x: number): number {
    const p = [...points].sort((a, b) => a.x - b.x),
        n = p.length;
    if (n < 2) return p[0]?.y ?? x;
    const y2 = new Array<number>(n).fill(0),
        u = new Array<number>(n).fill(0);
    for (let i = 1; i < n - 1; i++) {
        const width = p[i + 1].x - p[i - 1].x,
            sig = (p[i].x - p[i - 1].x) / width,
            q = sig * y2[i - 1] + 2;
        y2[i] = (sig - 1) / q;
        const dd = (p[i + 1].y - p[i].y) / (p[i + 1].x - p[i].x) - (p[i].y - p[i - 1].y) / (p[i].x - p[i - 1].x);
        u[i] = ((6 * dd) / width - sig * u[i - 1]) / q;
    }
    for (let i = n - 2; i >= 0; i--) y2[i] = y2[i] * y2[i + 1] + u[i];
    let lo = 0,
        hi = n - 1;
    while (hi - lo > 1) {
        const k = (hi + lo) >> 1;
        if (p[k].x > x) hi = k;
        else lo = k;
    }
    const h = p[hi].x - p[lo].x,
        a = (p[hi].x - x) / h,
        b = (x - p[lo].x) / h;
    return a * p[lo].y + b * p[hi].y + (((a ** 3 - a) * y2[lo] + (b ** 3 - b) * y2[hi]) * h * h) / 6;
}
export function curveLut(points: CurvePoint[]): Uint8Array {
    return Uint8Array.from({ length: 256 }, (_, i) => Math.trunc(clamp(interpolateNatural(points, i), 0, 255)));
}
export function levelsValue(a: LevelsChannel, input: number): number {
    if (input < a.inputLow) return a.outputLow;
    if (input >= a.inputHigh) return a.outputHigh;
    return Math.trunc(
        clamp(
            a.outputLow +
                (a.outputHigh - a.outputLow) * Math.pow((input - a.inputLow) / (a.inputHigh - a.inputLow), a.gamma),
            0,
            255,
        ),
    );
}
export function levelsLut(a: LevelsChannel): Uint8Array {
    return Uint8Array.from({ length: 256 }, (_, i) => levelsValue(a, i));
}
export interface Hsl {
    h: number;
    s: number;
    l: number;
}
export function rgbToHsl(r: number, g: number, b: number): Hsl {
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b),
        d = max - min,
        l = (max + min) / 2;
    if (d === 0) return { h: 0, s: 0, l };
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (((h / 6) % 1) + 1) % 1;
    return { h, s, l };
}
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    h = ((h % 1) + 1) % 1;
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s,
        x = c * (1 - Math.abs(((h * 6) % 2) - 1)),
        m = l - c / 2;
    const rgb =
        h < 1 / 6
            ? [c, x, 0]
            : h < 2 / 6
              ? [x, c, 0]
              : h < 3 / 6
                ? [0, c, x]
                : h < 4 / 6
                  ? [0, x, c]
                  : h < 5 / 6
                    ? [x, 0, c]
                    : [c, 0, x];
    return [rgb[0] + m, rgb[1] + m, rgb[2] + m];
}
/** Convert a finite normalized float to IEEE 754 binary16, with round-to-nearest-even. */
export function normalizedFloatToHalf(value: number): number {
    const v = clamp(Number.isFinite(value) ? value : 0, 0, 1);
    if (v === 0) return 0;
    const bits = new Uint32Array(new Float32Array([v]).buffer)[0];
    const exponent = (bits >>> 23) & 0xff;
    let halfExponent = exponent - 127 + 15;
    let mantissa = bits & 0x7fffff;
    if (halfExponent <= 0) {
        if (halfExponent < -10) return 0;
        mantissa |= 0x800000;
        const shift = 14 - halfExponent;
        const rounded = (mantissa + (1 << (shift - 1)) - 1 + ((mantissa >>> shift) & 1)) >>> shift;
        return rounded;
    }
    if (halfExponent >= 31) return 0x7bff;
    mantissa += 0xfff + ((mantissa >>> 13) & 1);
    if (mantissa & 0x800000) {
        mantissa = 0;
        halfExponent++;
        if (halfExponent >= 31) return 0x7bff;
    }
    return (halfExponent << 10) | (mantissa >>> 13);
}

export function levelsValueFloat(a: LevelsChannel, input: number): number {
    const value = input * 255;
    if (value < a.inputLow) return a.outputLow / 255;
    if (value >= a.inputHigh) return a.outputHigh / 255;
    return clamp(
        (a.outputLow +
            (a.outputHigh - a.outputLow) * Math.pow((value - a.inputLow) / (a.inputHigh - a.inputLow), a.gamma)) /
            255,
        0,
        1,
    );
}

/** Paint.NET-shaped HSL control, evaluated without byte conversion or truncation. */
export function applyHslAdjustmentFloat(a: HslAdjustment, rgb: [number, number, number]): [number, number, number] {
    if (!a.enabled || (a.hue === 0 && a.saturation === 100 && a.lightness === 0)) return [...rgb];
    const [r, g, b] = rgb;
    const intensity = (7471 * b + 38470 * g + 19595 * r) / 65536;
    const internalSaturation = a.saturation > 100 ? (a.saturation - 100) * 3 + 100 : a.saturation;
    const factor = internalSaturation / 100;
    let converted = [r, g, b].map((channel) => clamp(intensity + (channel - intensity) * factor, 0, 1)) as [
        number,
        number,
        number,
    ];
    if (a.hue !== 0) {
        const max = Math.max(...converted),
            min = Math.min(...converted),
            delta = max - min,
            saturation = max === 0 ? 0 : delta / max;
        let hue = 0;
        if (delta !== 0)
            hue =
                max === converted[0]
                    ? ((converted[1] - converted[2]) / delta) % 6
                    : max === converted[1]
                      ? (converted[2] - converted[0]) / delta + 2
                      : (converted[0] - converted[1]) / delta + 4;
        hue = (((hue / 6 + a.hue / 360) % 1) + 1) % 1;
        const h = hue * 6,
            sector = Math.floor(h),
            fraction = h - sector,
            p = max * (1 - saturation),
            q = max * (1 - saturation * fraction),
            t = max * (1 - saturation * (1 - fraction));
        converted = (
            saturation === 0
                ? [max, max, max]
                : sector === 0
                  ? [max, t, p]
                  : sector === 1
                    ? [q, max, p]
                    : sector === 2
                      ? [p, max, t]
                      : sector === 3
                        ? [p, q, max]
                        : sector === 4
                          ? [t, p, max]
                          : [max, p, q]
        ) as [number, number, number];
    }
    if (a.lightness !== 0) {
        const amount = Math.abs(a.lightness) / 100,
            target = a.lightness > 0 ? 1 : 0;
        converted = converted.map((channel) => channel * (1 - amount) + target * amount) as [number, number, number];
    }
    return converted;
}

/** Apply the literal stack order while retaining normalized floating-point components throughout. */
export function applyAdjustmentStackFloat(
    stack: Adjustment[],
    input: [number, number, number],
): [number, number, number] {
    let rgb = [...input] as [number, number, number];
    for (const a of stack) {
        if (!a.enabled) continue;
        if (a.type === 'hsl') rgb = applyHslAdjustmentFloat(a, rgb);
        else if (a.type === 'levels')
            rgb = CHANNELS.map((channel, i) => levelsValueFloat(a.channels[channel], rgb[i])) as [
                number,
                number,
                number,
            ];
        else if (a.mode === 'rgb')
            rgb = CHANNELS.map((channel, i) =>
                clamp(interpolateNatural(a.channels[channel], rgb[i] * 255) / 255, 0, 1),
            ) as [number, number, number];
        else {
            const hsl = rgbToHsl(...rgb);
            rgb = hslToRgb(
                clamp(interpolateNatural(a.channels.h, hsl.h * 255) / 255, 0, 1),
                clamp(interpolateNatural(a.channels.s, hsl.s * 255) / 255, 0, 1),
                clamp(interpolateNatural(a.channels.l, hsl.l * 255) / 255, 0, 1),
            );
        }
    }
    return rgb;
}

/** CPU-composed RGB 3D RGBA16F LUT used by the Colour pipeline. */
export function composeAdjustmentLut(stack: Adjustment[]): Uint16Array {
    const size = ADJUSTMENT_LUT_SIZE;
    const rgba = new Uint16Array(size ** 3 * 4);
    for (let b = 0; b < size; b++) {
        for (let g = 0; g < size; g++) {
            for (let r = 0; r < size; r++) {
                const rgb = applyAdjustmentStackFloat(stack, [r / (size - 1), g / (size - 1), b / (size - 1)]);
                const offset = (b * size * size + g * size + r) * 4;
                rgba[offset] = normalizedFloatToHalf(rgb[0]);
                rgba[offset + 1] = normalizedFloatToHalf(rgb[1]);
                rgba[offset + 2] = normalizedFloatToHalf(rgb[2]);
                rgba[offset + 3] = 0x3c00;
            }
        }
    }
    return rgba;
}

export function isNeutralAdjustment(a: Adjustment): boolean {
    if (!a.enabled) return true;
    if (a.type === 'hsl') return a.hue === 0 && a.saturation === 100 && a.lightness === 0;
    if (a.type === 'levels')
        return CHANNELS.every((channel) => {
            const value = a.channels[channel];
            return (
                value.inputLow === 0 &&
                value.inputHigh === 255 &&
                value.gamma === 1 &&
                value.outputLow === 0 &&
                value.outputHigh === 255
            );
        });
    const channels: readonly string[] = a.mode === 'rgb' ? CHANNELS : HSL_CHANNELS;
    return channels.every((channel) => {
        const points = (a.channels as Record<string, CurvePoint[]>)[channel];
        return (
            points.length === 2 && points[0].x === 0 && points[0].y === 0 && points[1].x === 255 && points[1].y === 255
        );
    });
}
export function setLevelsChannelValue(
    a: LevelsAdjustment,
    channel: Channel,
    key: LevelsKey,
    raw: number,
): LevelsAdjustment {
    return { ...a, channels: { ...a.channels, [channel]: setLevelsValue(a.channels[channel], key, raw) } };
}
export function setLevelsChannelsValue(
    a: LevelsAdjustment,
    channels: readonly Channel[],
    key: LevelsKey,
    raw: number,
): LevelsAdjustment {
    return channels.reduce((next, channel) => setLevelsChannelValue(next, channel, key, raw), a);
}

/** Toggle a Paint.NET-style channel mask, preserving canonical channel order. */
export function toggleChannelMask<T extends string>(mask: readonly T[], channel: T, order?: readonly T[]): T[] {
    const ordered = order ?? (CHANNELS as unknown as readonly T[]);
    if (!mask.includes(channel)) return ordered.filter((item) => item === channel || mask.includes(item));
    return ordered.filter((item) => item !== channel && mask.includes(item));
}

/** Apply a semantic curve operation without disturbing unrelated control points. */
export function applyCurveEdit(points: CurvePoint[], edit: CurveEdit): CurvePoint[] {
    const x = Math.round(clamp(edit.x, 0, 255));
    if (edit.type === 'remove') {
        if (x === 0 || x === 255) return points;
        return points.some((point) => point.x === x)
            ? points.filter((point) => point.x !== x).map((point) => ({ ...point }))
            : points;
    }
    const y = Math.round(clamp(edit.y, 0, 255));
    const targetX = edit.type === 'move' && (edit.oldX === 0 || edit.oldX === 255) ? edit.oldX : x;
    const retained = points.filter((point) => point.x !== targetX && (edit.type !== 'move' || point.x !== edit.oldX));
    return [...retained.map((point) => ({ ...point })), { x: targetX, y }].sort((a, b) => a.x - b.x);
}

export function applyCurveEditToChannels<T extends CurveAdjustment>(
    a: T,
    channels: readonly CurveChannel[],
    edit: CurveEdit,
): T {
    if (channels.length === 0) return a;
    const next: Record<string, CurvePoint[]> = { ...a.channels };
    for (const channel of channels) if (channel in next) next[channel] = applyCurveEdit(next[channel], edit);
    return { ...a, channels: next } as T;
}
export function setLevelsValue(a: LevelsChannel, key: LevelsKey, raw: number): LevelsChannel {
    const n = finite(raw, a[key]);
    const next = {
        ...a,
        [key]:
            key === 'gamma'
                ? clamp(n, 0.1, 10)
                : Math.round(clamp(n, key.endsWith('Low') ? 0 : 1, key.endsWith('Low') ? 254 : 255)),
    };
    if (key === 'inputLow' && next.inputLow >= next.inputHigh) next.inputHigh = next.inputLow + 1;
    if (key === 'inputHigh' && next.inputHigh <= next.inputLow) next.inputLow = next.inputHigh - 1;
    if (key === 'outputLow' && next.outputLow >= next.outputHigh) next.outputHigh = next.outputLow + 1;
    if (key === 'outputHigh' && next.outputHigh <= next.outputLow) next.outputLow = next.outputHigh - 1;
    return next;
}
function sanitizePoints(value: unknown): CurvePoint[] {
    if (!Array.isArray(value)) return identityPoints();
    const byX = new Map<number, number>();
    for (const q of value.slice(0, MAX_CURVE_POINTS))
        if (q && typeof q === 'object') {
            const p = q as Record<string, unknown>;
            if (typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y))
                byX.set(Math.round(clamp(p.x, 0, 255)), Math.round(clamp(p.y, 0, 255)));
        }
    if (!byX.has(0)) byX.set(0, 0);
    if (!byX.has(255)) byX.set(255, 255);
    return [...byX].map(([x, y]) => ({ x, y })).sort((a, b) => a.x - b.x);
}
function sanitizeLevel(value: unknown): LevelsChannel {
    const r = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    let a = identityLevels();
    for (const key of ['inputLow', 'inputHigh', 'gamma', 'outputLow', 'outputHigh'] as LevelsKey[])
        a = setLevelsValue(a, key, finite(r[key], a[key]));
    return a;
}
export function sanitizeAdjustments(value: unknown): Adjustment[] {
    if (!Array.isArray(value)) return [];
    const ids = new Set<string>();
    const idFor = (v: unknown) => {
        const valid = typeof v === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(v) && !ids.has(v);
        const id = valid ? v : adjustmentId();
        ids.add(id);
        return id;
    };
    const out: Adjustment[] = [];
    for (const raw of value) {
        if (out.length >= MAX_ADJUSTMENTS || !raw || typeof raw !== 'object') continue;
        const r = raw as Record<string, unknown>,
            enabled = typeof r.enabled === 'boolean' ? r.enabled : true;
        const channels =
            r.channels && typeof r.channels === 'object' ? (r.channels as Record<string, unknown>) : undefined;
        if (r.type === 'levels') {
            // Legacy scalar fields are copied to all channels; malformed/missing canonical channels are identity.
            const legacy = CHANNELS.some((c) => channels?.[c] !== undefined) ? undefined : r;
            out.push({
                id: idFor(r.id),
                type: 'levels',
                enabled,
                channels: {
                    r: sanitizeLevel(channels?.r ?? legacy),
                    g: sanitizeLevel(channels?.g ?? legacy),
                    b: sanitizeLevel(channels?.b ?? legacy),
                },
            });
        } else if (r.type === 'hsl') {
            out.push({
                id: idFor(r.id),
                type: 'hsl',
                enabled,
                hue: Math.round(clamp(finite(r.hue, 0), -180, 180)),
                saturation: Math.round(clamp(finite(r.saturation, 100), 0, 200)),
                lightness: Math.round(clamp(finite(r.lightness, 0), -100, 100)),
            });
        } else if (r.type === 'curve' && (channels || Array.isArray(r.points))) {
            const mode = r.mode === 'hsl' ? 'hsl' : 'rgb';
            out.push({
                id: idFor(r.id),
                type: 'curve',
                enabled,
                mode,
                channels:
                    mode === 'hsl'
                        ? {
                              h: sanitizePoints(channels?.h),
                              s: sanitizePoints(channels?.s),
                              l: sanitizePoints(channels?.l),
                          }
                        : {
                              r: sanitizePoints(channels?.r ?? r.points),
                              g: sanitizePoints(channels?.g ?? r.points),
                              b: sanitizePoints(channels?.b ?? r.points),
                          },
            } as CurveAdjustment);
        }
    }
    return out;
}
