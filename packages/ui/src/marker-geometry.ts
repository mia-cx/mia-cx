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

export interface Shape {
    /** Degrees the leading end leans, like a marker stroke. 0 is upright. */
    skewHead: number;
    /** Degrees the trailing end leans. */
    skewTail: number;
    radius: number;
}

/**
 * A block's corners, clockwise from the top of its trailing end. A skewed end leans like `/`: its top
 * sits further along the line than its bottom.
 */
export function shapePoints({ l, r, t, b }: Edges, { skewHead, skewTail }: Shape): Point[] {
    const height = b - t;
    const lean = (degrees: number) => Math.min((r - l) / 2, height * Math.tan((degrees * Math.PI) / 180));
    const tail = lean(skewTail);
    const head = lean(skewHead);
    return [
        { x: l + tail, y: t },
        { x: r, y: t },
        { x: r - head, y: b },
        { x: l, y: b },
    ];
}

const round = (n: number) => Math.round(n * 100) / 100;

/** One block as an SVG path, its corners rounded by `radius` where they have room. */
export function shapePath(edges: Edges, shape: Shape): string {
    const points = shapePoints(edges, shape);
    if (shape.radius <= 0) return `M${points.map(({ x, y }) => `${round(x)} ${round(y)}`).join('L')}Z`;
    const toward = (from: Point, to: Point, distance: number): Point => {
        const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
        return { x: from.x + ((to.x - from.x) / length) * distance, y: from.y + ((to.y - from.y) / length) * distance };
    };
    const corners = points.map((corner, i) => {
        const previous = points[(i + points.length - 1) % points.length];
        const next = points[(i + 1) % points.length];
        const room =
            Math.min(
                Math.hypot(corner.x - previous.x, corner.y - previous.y),
                Math.hypot(next.x - corner.x, next.y - corner.y),
            ) / 2;
        const r = Math.min(shape.radius, room);
        return { corner, in: toward(corner, previous, r), out: toward(corner, next, r) };
    });
    const at = ({ x, y }: Point) => `${round(x)} ${round(y)}`;
    return `M${at(corners[0].out)}${corners
        .slice(1)
        .concat(corners[0])
        .map((c) => `L${at(c.in)}Q${at(c.corner)} ${at(c.out)}`)
        .join('')}Z`;
}
