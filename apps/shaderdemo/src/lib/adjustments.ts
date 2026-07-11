export const MAX_ADJUSTMENTS = 128;
export const MAX_CURVE_POINTS = 256;

export interface CurvePoint {
    x: number;
    y: number;
}
export interface CurveAdjustment {
    id: string;
    type: 'curve';
    enabled: boolean;
    points: CurvePoint[];
}
export interface LevelsAdjustment {
    id: string;
    type: 'levels';
    enabled: boolean;
    inputLow: number;
    inputHigh: number;
    gamma: number;
    outputLow: number;
    outputHigh: number;
}
export type Adjustment = CurveAdjustment | LevelsAdjustment;
export type LevelsKey = 'inputLow' | 'inputHigh' | 'gamma' | 'outputLow' | 'outputHigh';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finite = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
export const adjustmentId = () =>
    globalThis.crypto?.randomUUID?.() ?? `adjustment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const newCurve = (): CurveAdjustment => ({
    id: adjustmentId(),
    type: 'curve',
    enabled: true,
    points: [
        { x: 0, y: 0 },
        { x: 255, y: 255 },
    ],
});
export const newLevels = (): LevelsAdjustment => ({
    id: adjustmentId(),
    type: 'levels',
    enabled: true,
    inputLow: 0,
    inputHigh: 255,
    gamma: 1,
    outputLow: 0,
    outputHigh: 255,
});

/** Natural cubic spline matching OpenPDN Core/SplineInterpolator.cs (natural endpoints). */
export function interpolateNatural(points: CurvePoint[], x: number): number {
    const p = [...points].sort((a, b) => a.x - b.x),
        n = p.length;
    if (n < 2) return p[0]?.y ?? x;
    const y2 = new Array<number>(n).fill(0),
        u = new Array<number>(n).fill(0);
    for (let i = 1; i < n - 1; i++) {
        const width = p[i + 1].x - p[i - 1].x;
        const sig = (p[i].x - p[i - 1].x) / width;
        const q = sig * y2[i - 1] + 2;
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

/** Paint.NET ClampToByte semantics: clamp, then truncate. */
export function curveLut(points: CurvePoint[]): Uint8Array {
    return Uint8Array.from({ length: 256 }, (_, i) => Math.trunc(clamp(interpolateNatural(points, i), 0, 255)));
}
export function levelsValue(a: LevelsAdjustment, input: number): number {
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
export function levelsLut(a: LevelsAdjustment): Uint8Array {
    return Uint8Array.from({ length: 256 }, (_, i) => levelsValue(a, i));
}
/** Byte LUT indexing after every operation intentionally preserves Paint.NET's intermediate quantization. */
export function composeAdjustmentLut(stack: Adjustment[]): Uint8Array {
    let result = Uint8Array.from({ length: 256 }, (_, i) => i);
    for (const a of stack)
        if (a.enabled) {
            const next = a.type === 'curve' ? curveLut(a.points) : levelsLut(a);
            result = Uint8Array.from(result, (v) => next[v]);
        }
    return result;
}

export function setLevelsValue(a: LevelsAdjustment, key: LevelsKey, raw: number): LevelsAdjustment {
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
        if (r.type === 'levels') {
            let a = newLevels();
            a = { ...a, id: idFor(r.id), enabled };
            for (const key of ['inputLow', 'inputHigh', 'gamma', 'outputLow', 'outputHigh'] as LevelsKey[])
                a = setLevelsValue(a, key, finite(r[key], a[key]));
            out.push(a);
        } else if (r.type === 'curve' && Array.isArray(r.points)) {
            const byX = new Map<number, number>();
            for (const q of r.points.slice(0, MAX_CURVE_POINTS))
                if (q && typeof q === 'object') {
                    const point = q as Record<string, unknown>;
                    if (
                        typeof point.x === 'number' &&
                        Number.isFinite(point.x) &&
                        typeof point.y === 'number' &&
                        Number.isFinite(point.y)
                    )
                        byX.set(Math.round(clamp(point.x, 0, 255)), Math.round(clamp(point.y, 0, 255)));
                }
            if (!byX.has(0)) byX.set(0, 0);
            if (!byX.has(255)) byX.set(255, 255);
            out.push({
                id: idFor(r.id),
                type: 'curve',
                enabled,
                points: [...byX].map(([x, y]) => ({ x, y })).sort((a, b) => a.x - b.x),
            });
        }
    }
    return out;
}
