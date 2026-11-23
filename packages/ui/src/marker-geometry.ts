/**
 * The geometry behind `<mia-marker>`: where its blocks go and what shape they take. Pure, so the
 * rules can be tested without a browser.
 */

/** A rectangle by its four edges, in the marker's own coordinates. */
export interface Edges {
    l: number;
    r: number;
    t: number;
    b: number;
}

export interface Point {
    x: number;
    y: number;
}

/** Rects closer together vertically than this sit on the same line. */
const SAME_LINE = 4;

/**
 * Merges text rects into one span per line, top to bottom. Each span keeps the first item that
 * started it, so callers can tell which element a line belongs to.
 */
export function mergeLines<T>(items: { rect: Edges; item: T }[]): (Edges & { item: T })[] {
    const lines: (Edges & { item: T })[] = [];
    for (const { rect, item } of items) {
        const line = lines.find((l) => Math.abs(l.t - rect.t) < SAME_LINE);
        if (!line) {
            lines.push({ ...rect, item });
            continue;
        }
        line.l = Math.min(line.l, rect.l);
        line.r = Math.max(line.r, rect.r);
        line.b = Math.max(line.b, rect.b);
    }
    return lines.sort((a, b) => a.t - b.t);
}

export const sameLine = (a: Edges, b: Edges) => Math.abs(a.t - b.t) < SAME_LINE;

/**
 * Where a block shrinks to when it leaves: into its end when the point is below it, its start when
 * the point is above it, and the point's own spot when the point is level with it.
 */
export function shrinkTarget({ l, r, t, b }: Edges, point: Point | undefined): number {
    if (!point) return (l + r) / 2;
    if (point.y < t) return l;
    if (point.y > b) return r;
    return Math.min(r, Math.max(l, point.x));
}

/** The order blocks leave in when a selection clears toward a point: farthest line first. */
export function wipeOrder<T extends Edges>(blocks: T[], point: Point): T[] {
    const distance = (e: Edges) => Math.abs((e.t + e.b) / 2 - point.y);
    return [...blocks].sort((a, b) => distance(b) - distance(a));
}

const round = (n: number) => Math.round(n * 100) / 100;

/** One block as an SVG path: a rectangle, its corners rounded by `radius` where they have room. */
export function shapePath({ l, r, t, b }: Edges, radius: number): string {
    const [x0, x1, y0, y1] = [l, r, t, b].map(round);
    const c = round(Math.min(radius, (r - l) / 2, (b - t) / 2));
    if (c <= 0) return `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;
    const arc = (x: number, y: number) => `A${c} ${c} 0 0 1 ${x} ${y}`;
    return (
        `M${x0 + c} ${y0}H${x1 - c}${arc(x1, y0 + c)}V${y1 - c}${arc(x1 - c, y1)}` +
        `H${x0 + c}${arc(x0, y1 - c)}V${y0 + c}${arc(x0 + c, y0)}Z`
    );
}
