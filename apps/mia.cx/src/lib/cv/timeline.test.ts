import { describe, expect, test } from 'vitest';
import { LABEL_HEIGHT, TAIL, layoutTimeline } from './timeline';

const today = new Date(2026, 9, 29);
const HEIGHT = 92;
const entry = (title: string, start: string, end?: string) => ({ title, subtitle: '', start, end });
// Two overlapping jobs that ended, one ongoing; a creative practice running since 2015.
const work = [entry('School', '2012-09', '2019-07'), entry('Shop', '2016-09', '2020-03'), entry('Job', '2026-09')];
const creative = [entry('Music', '2015-01')];
const layout = layoutTimeline({ left: work, right: creative }, today, HEIGHT);
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
        const bars = [...layout.sides.left.bars, ...layout.sides.right.bars];
        expect(bars.filter((bar) => bar.ongoing).map((bar) => bar.y2)).toEqual([HEIGHT, HEIGHT]);
        for (const bar of bars.filter((bar) => !bar.ongoing)) expect(bar.y2).toBeLessThan(HEIGHT);
    });

    test('keeps labels in entry order without overlapping', () => {
        for (const { labels } of Object.values(layout.sides)) {
            for (let i = 1; i < labels.length; i++)
                expect(labels[i].y - labels[i - 1].y).toBeGreaterThanOrEqual(LABEL_HEIGHT);
        }
        expect(layout.sides.left.labels.map(({ title }) => title)).toEqual(['School', 'Shop', 'Job']);
    });

    test('gives recent years more room than older ones', () => {
        expect(yearY(2026) - yearY(2025)).toBeGreaterThan(yearY(2013) - yearY(2012));
    });

    test('gives overlapping entries their own lanes', () => {
        const [school, shop] = layout.sides.left.bars;
        expect(shop.offset).not.toBe(school.offset);
    });

    test('counts an entry through its end month', () => {
        // A one-month role, and two roles that both ran in July 2019.
        const { bars } = layoutTimeline(
            {
                left: [
                    entry('A', '2018-03', '2018-03'),
                    entry('B', '2019-01', '2019-07'),
                    entry('C', '2019-07', '2020-01'),
                ],
                right: [],
            },
            today,
            HEIGHT,
        ).sides.left;
        expect(bars[0].y2).toBeGreaterThan(bars[0].y1);
        expect(bars[2].offset).not.toBe(bars[1].offset);
    });
});
