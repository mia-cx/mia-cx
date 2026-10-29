/**
 * Lays out the CV's experience timeline on a log scale: recent years get the room, older ones
 * still show. Units are millimetres on the printed page. Each side is measured outward from the
 * axis, so the drawing decides where the axis sits.
 */
import type { TimelineEntry } from './content';

/** How fast the scale compresses the past: y follows ln(1 + K·years ago). */
const K = 2;
/** Length of the dashed tail below today, standing for the future. */
export const TAIL = 7;
/** Distance from the axis to a side's first bar, and between bars sharing a side. */
const FIRST_LANE = 9;
const LANE = 2;
/** Space between a side's outermost bar and its labels. */
const LABEL_GAP = 2;
/** Height one label takes (title over subtitle), and the least room a year label needs. */
export const LABEL_HEIGHT = 6.6;
const YEAR_ROOM = 3.5;

export type Side = 'left' | 'right';

export interface Bar {
    /** Distance from the axis. */
    offset: number;
    y1: number;
    y2: number;
    /** Still running: the bar continues into the dashed tail instead of ending in a dot. */
    ongoing: boolean;
}

export interface Label {
    title: string;
    subtitle: string;
    /** Top of the label, pushed down from its bar's start when the label above needs the room. */
    y: number;
}

export interface TimelineLayout {
    /** Where the axis starts (the first entry's year) and ends (today); the tail runs on past `end`. */
    axis: { top: number; end: number };
    /** Total height, tail included. */
    height: number;
    /** Every year from the first to today; `labelled` where its label fits. */
    ticks: { year: number; y: number; labelled: boolean }[];
    sides: Record<Side, { bars: Bar[]; labels: Label[]; labelOffset: number }>;
}

/** A `YYYY-MM` month as a fractional year, at the month's start. */
const toYear = (month: string) => {
    const [year, m] = month.split('-').map(Number);
    return year + (m - 1) / 12;
};

/** Today as a fractional year. */
const yearOf = (date: Date) => {
    const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    return date.getFullYear() + (date.getMonth() + (date.getDate() - 1) / days) / 12;
};

/**
 * Places each side's entries against an axis `height` tall, from the earliest start down to `today`.
 * Entries overlapping in time take separate lanes; labels keep their entries' order and never overlap.
 */
export function layoutTimeline(entries: Record<Side, TimelineEntry[]>, today: Date, height: number): TimelineLayout {
    const now = yearOf(today);
    const all = [...entries.left, ...entries.right];
    const first = Math.floor(Math.min(...all.map(({ start }) => toYear(start))));
    const scale = (t: number) => Math.log1p(K * (now - t));
    const y = (t: number) => height * (1 - scale(t) / scale(first));

    const ticks: TimelineLayout['ticks'] = [];
    let lastLabel = -Infinity;
    for (let year = first; year <= now; year++) {
        const at = y(year);
        const labelled = year === first || (at - lastLabel >= YEAR_ROOM && height - at >= YEAR_ROOM);
        if (labelled) lastLabel = at;
        ticks.push({ year, y: at, labelled });
    }

    const side = (list: TimelineEntry[]) => {
        const sorted = list.toSorted((a, b) => toYear(a.start) - toYear(b.start));
        // Each lane remembers when its last bar ends; a bar takes the first lane free by its start.
        const laneEnds: number[] = [];
        const bars = sorted.map(({ start, end }) => {
            const from = toYear(start),
                to = end ? toYear(end) : now;
            let lane = laneEnds.findIndex((free) => free <= from);
            if (lane < 0) lane = laneEnds.length;
            laneEnds[lane] = to;
            return { offset: FIRST_LANE + lane * LANE, y1: y(from), y2: y(to), ongoing: !end };
        });
        let floor = -Infinity;
        const labels = sorted.map(({ title, subtitle }, i) => {
            const top = Math.max(bars[i].y1, floor);
            floor = top + LABEL_HEIGHT;
            return { title, subtitle, y: top };
        });
        const labelOffset = FIRST_LANE + (laneEnds.length - 1) * LANE + LABEL_GAP;
        return { bars, labels, labelOffset };
    };

    const sides = { left: side(entries.left), right: side(entries.right) };
    const lowest = Math.max(...[...sides.left.labels, ...sides.right.labels].map((label) => label.y + LABEL_HEIGHT));
    return { axis: { top: y(first), end: height }, height: Math.max(height + TAIL, lowest), ticks, sides };
}
