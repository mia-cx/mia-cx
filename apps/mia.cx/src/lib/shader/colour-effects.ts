export const RGB_COLOUR_KINDS = [
    'lift-gamma-gain',
    'three-way',
    'channel-mixer',
    'color-balance',
    'selective-color',
    'lut',
    'posterize',
    'solarize',
    'dither',
    'tone-mapping',
] as const;
export type RgbColourKind = (typeof RGB_COLOUR_KINDS)[number];
export type ToneMapMode = 'none' | 'reinhard' | 'aces' | 'agx' | 'custom';
export type DitherMode = 'bayer' | 'blue-noise' | 'approx-error-diffusion';
export interface RgbColourEffect {
    id: string;
    type: RgbColourKind;
    enabled: boolean;
    values: number[];
    mode?: string;
    assetId?: string;
    assetName?: string;
    assetSize?: number;
    missing?: boolean;
}
export const RGB_COLOUR_LABELS: Record<RgbColourKind, string> = {
    'lift-gamma-gain': 'Lift / Gamma / Gain',
    'three-way': 'Three-way colour',
    'channel-mixer': 'Channel mixer',
    'color-balance': 'Color balance',
    'selective-color': 'Selective colour',
    lut: '3D LUT (.cube)',
    posterize: 'Posterize',
    solarize: 'Solarize',
    dither: 'Dither',
    'tone-mapping': 'Tone mapping',
};
export const SELECTIVE_RANGES = [
    'Reds',
    'Yellows',
    'Greens',
    'Cyans',
    'Blues',
    'Magentas',
    'Whites',
    'Neutrals',
    'Blacks',
] as const;
const lengths: Record<RgbColourKind, number> = {
    'lift-gamma-gain': 9,
    'three-way': 12,
    'channel-mixer': 12,
    'color-balance': 9,
    'selective-color': 36,
    lut: 1,
    posterize: 1,
    solarize: 2,
    dither: 2,
    'tone-mapping': 3,
};
export function colourDefaults(type: RgbColourKind): RgbColourEffect {
    let values = Array(lengths[type]).fill(0);
    let mode: string | undefined;
    if (type === 'lift-gamma-gain') values = [0, 0, 0, 1, 1, 1, 1, 1, 1];
    if (type === 'channel-mixer') values = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
    if (type === 'lut') values = [1];
    if (type === 'posterize') values = [256];
    if (type === 'solarize') values = [1, 0.5];
    if (type === 'dither') {
        values = [256, 1];
        mode = 'bayer';
    }
    if (type === 'tone-mapping') {
        values = [1, 1, 1];
        mode = 'none';
    }
    return { id: '', type, enabled: true, values, mode };
}
export function createRgbColour(type: RgbColourKind, id: string): RgbColourEffect {
    return { ...colourDefaults(type), id };
}
export function sanitizeRgbColour(value: unknown): RgbColourEffect | null {
    const x = value as Partial<RgbColourEffect>;
    if (!x || !RGB_COLOUR_KINDS.includes(x.type as RgbColourKind) || typeof x.id !== 'string') return null;
    const d = colourDefaults(x.type as RgbColourKind);
    const values = d.values.map((v, i) =>
        typeof x.values?.[i] === 'number' && Number.isFinite(x.values[i]) ? x.values[i] : v,
    );
    const out = { ...d, ...x, enabled: x.enabled !== false, values } as RgbColourEffect;
    if (out.type === 'dither' && !['bayer', 'blue-noise', 'approx-error-diffusion'].includes(out.mode || ''))
        out.mode = 'bayer';
    if (out.type === 'tone-mapping' && !['none', 'reinhard', 'aces', 'agx', 'custom'].includes(out.mode || ''))
        out.mode = 'none';
    return out;
}
export function isRgbColour(x: { type: string }): x is RgbColourEffect {
    return RGB_COLOUR_KINDS.includes(x.type as RgbColourKind);
}
export function isNeutralRgb(x: RgbColourEffect) {
    if (x.type === 'lut') return !x.enabled || !x.assetId || x.missing === true || x.values[0] === 0;
    const d = colourDefaults(x.type);
    return !x.enabled || (JSON.stringify(x.values) === JSON.stringify(d.values) && (x.mode ?? '') === (d.mode ?? ''));
}
export interface CubeLut {
    size: number;
    data: Float32Array;
    title?: string;
    domainMin: [number, number, number];
    domainMax: [number, number, number];
}
export function parseCube(text: string): CubeLut {
    let size = 0,
        title: string | undefined;
    let min: [number, number, number] = [0, 0, 0],
        max: [number, number, number] = [1, 1, 1];
    const rows: number[][] = [];
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/#.*/, '').trim();
        if (!line) continue;
        const p = line.match(/"[^"]*"|\S+/g) || [];
        const first = p[0];
        if (!first) continue;
        const key = first.toUpperCase();
        if (key === 'TITLE') title = p.slice(1).join(' ').replace(/^"|"$/g, '');
        else if (key === 'LUT_3D_SIZE') size = +p[1];
        else if (key === 'DOMAIN_MIN') min = p.slice(1, 4).map(Number) as typeof min;
        else if (key === 'DOMAIN_MAX') max = p.slice(1, 4).map(Number) as typeof max;
        else if (/^[-+.0-9]/.test(first)) rows.push(p.slice(0, 3).map(Number));
    }
    if (
        !Number.isInteger(size) ||
        size < 2 ||
        size > 64 ||
        rows.length !== size ** 3 ||
        rows.some((r) => r.length !== 3 || r.some((v) => !Number.isFinite(v))) ||
        min.some((v) => !Number.isFinite(v)) ||
        max.some((v, i) => !Number.isFinite(v) || v <= min[i])
    )
        throw new Error('Invalid .cube 3D LUT (expected LUT_3D_SIZE 2–64 and exactly size³ RGB rows).');
    return { size, data: new Float32Array(rows.flat()), title, domainMin: min, domainMax: max };
}
const DB = 'shaderdemo-colour-assets',
    STORE = 'cube-luts';
type StoredCube = Omit<CubeLut, 'data'> & { data: number[]; name: string };
const volatileAssets = new Map<string, StoredCube>();
const db = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
        if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
export async function saveCubeAsset(asset: CubeLut, name: string) {
    const id = crypto.randomUUID();
    const stored: StoredCube = {
        name,
        size: asset.size,
        data: Array.from(asset.data),
        domainMin: asset.domainMin,
        domainMax: asset.domainMax,
        title: asset.title,
    };
    volatileAssets.set(id, stored);
    let d: IDBDatabase;
    try {
        d = await db();
    } catch {
        return id;
    }
    await new Promise<void>((resolve, reject) => {
        const r = d.transaction(STORE, 'readwrite').objectStore(STORE).put(stored, id);
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
    });
    d.close();
    return id;
}
export async function loadCubeAsset(id: string): Promise<(CubeLut & { name: string }) | null> {
    let d: IDBDatabase;
    try {
        d = await db();
    } catch {
        const value = volatileAssets.get(id);
        return value ? { ...value, data: new Float32Array(value.data) } : null;
    }
    const value = await new Promise<any>((resolve, reject) => {
        const r = d.transaction(STORE).objectStore(STORE).get(id);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
    d.close();
    const result = value ?? volatileAssets.get(id);
    return result ? ({ ...result, data: new Float32Array(result.data) } as CubeLut & { name: string }) : null;
}
