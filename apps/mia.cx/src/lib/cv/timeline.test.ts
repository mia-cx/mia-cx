import { describe, expect, test } from 'vitest';
import { cv } from './content';
import { LABEL_HEIGHT, TAIL, layoutTimeline } from './timeline';

const today = new Date(2026, 9, 29);
const HEIGHT = 92;
const layout = layoutTimeline({ left: cv.timeline.work, right: cv.timeline.creative }, today, HEIGHT);
const yearY = (year: number) => layout.ticks.find((tick) => tick.year === year)!.y;

describe('the CV timeline', () => {
    test('ticks every year from the first entry to today, none past it', () => {
        expect(layout.ticks.map(({ year }) => year)).toEqual(Array.from({ length: 15 }, (_, i) => 2012 + i));
        for (const { y } of layout.ticks) expect(y).toBeLessThanOrEqual(layout.axis.end);
        expect(layout.ticks[0].labelled).toBe(true);
    });

    test('ends the axis at today, with ongoing entries running into the dashed tail', () => {
        expect(layout.axis.end).toBe(HEIGHT);
        expect(layout.height).toBeGreaterThanOrEqual(HEIGHT + TAIL);
        const ongoing = [...layout.sides.left.bars, ...layout.sides.right.bars].filter((bar) => bar.ongoing);
        // Humaris, then Music, Sound engineering, Design & development and mia.cx.
        expect(ongoing).toHaveLength(5);
        for (const bar of ongoing) expect(bar.y2).toBe(HEIGHT);
        const ended = layout.sides.left.bars.filter((bar) => !bar.ongoing);
        for (const bar of ended) expect(bar.y2).toBeLessThan(HEIGHT);
    });

    test('keeps labels in entry order without overlapping', () => {
        for (const { labels } of Object.values(layout.sides)) {
            for (let i = 1; i < labels.length; i++)
                expect(labels[i].y - labels[i - 1].y).toBeGreaterThanOrEqual(LABEL_HEIGHT);
        }
        expect(layout.sides.left.labels.map(({ title }) => title)).toEqual(cv.timeline.work.map(({ title }) => title));
    });

    test('gives recent years more room than older ones', () => {
        expect(yearY(2026) - yearY(2025)).toBeGreaterThan(yearY(2013) - yearY(2012));
    });

    test('gives overlapping entries their own lanes', () => {
        const [vwo, albertHeijn] = layout.sides.left.bars;
        expect(albertHeijn.offset).not.toBe(vwo.offset);
    });

    test('counts an entry through its end month', () => {
        const entry = (start: string, end: string) => ({ title: start, subtitle: '', start, end });
        // A one-month role, and two roles that both ran in July 2019.
        const { bars } = layoutTimeline(
            {
                left: [entry('2018-03', '2018-03'), entry('2019-01', '2019-07'), entry('2019-07', '2020-01')],
                right: [],
            },
            today,
            HEIGHT,
        ).sides.left;
        expect(bars[0].y2).toBeGreaterThan(bars[0].y1);
        expect(bars[2].offset).not.toBe(bars[1].offset);
    });
});
