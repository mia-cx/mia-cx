export const MAX_ADJUSTMENTS = 128;
export const MAX_CURVE_POINTS = 256;
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
export type Adjustment = CurveAdjustment | LevelsAdjustment;
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
export const newLevels = (): LevelsAdjustment => ({
    id: adjustmentId(),
    type: 'levels',
    enabled: true,
    channels: { r: identityLevels(), g: identityLevels(), b: identityLevels() },
});

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
const normalizedByte = (v: number) => Math.floor(clamp(v, 0, 1) * 255 + 0.5);
/** One RGBA8 LUT. This is valid because the shader's pre-adjustment output is scalar grayscale. */
export function composeAdjustmentLut(stack: Adjustment[]): Uint8Array {
    const rgba = new Uint8Array(1024);
    const prepared = stack.map((a) =>
        a.type === 'levels'
            ? { a, luts: CHANNELS.map((c) => levelsLut(a.channels[c])) }
            : a.mode === 'rgb'
              ? { a, luts: CHANNELS.map((c) => curveLut(a.channels[c])) }
              : { a, luts: HSL_CHANNELS.map((c) => curveLut(a.channels[c])) },
    );
    for (let i = 0; i < 256; i++) {
        let rgb: [number, number, number] = [i, i, i];
        for (const { a, luts } of prepared)
            if (a.enabled) {
                if (a.type !== 'curve' || a.mode === 'rgb') rgb = [luts[0][rgb[0]], luts[1][rgb[1]], luts[2][rgb[2]]];
                else {
                    const hsl = rgbToHsl(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
                    const mapped = [
                        luts[0][normalizedByte(hsl.h)] / 255,
                        luts[1][normalizedByte(hsl.s)] / 255,
                        luts[2][normalizedByte(hsl.l)] / 255,
                    ];
                    rgb = hslToRgb(mapped[0], mapped[1], mapped[2]).map(normalizedByte) as [number, number, number];
                }
            }
        rgba.set([...rgb, 255], i * 4);
    }
    return rgba;
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
