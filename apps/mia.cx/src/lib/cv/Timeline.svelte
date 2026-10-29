<!--
    The experience timeline on page 1: work and education left of the axis, creative practice right.
    A visual summary only; page 2 carries the facts. Labels are real text, so they stay selectable.
-->
<script lang="ts">
    import type { TimelineEntry } from './content';
    import { TAIL, layoutTimeline } from './timeline';

    let {
        work,
        creative,
        today = new Date(),
    }: { work: TimelineEntry[]; creative: TimelineEntry[]; today?: Date } = $props();

    /** Millimetres: the axis's height, and the room each side has for its bars and labels. */
    const HEIGHT = 92;
    const LEFT = 62;
    const RIGHT = 48;
    /** Room above the axis for the side headings. */
    const HEAD = 6;

    const layout = $derived(layoutTimeline({ left: work, right: creative }, today, HEIGHT));
    const sides = $derived(
        (['left', 'right'] as const).map((side) => ({
            ...layout.sides[side],
            dir: side === 'left' ? -1 : 1,
            anchor: side === 'left' ? 'end' : 'start',
        })),
    );
</script>

<svg
    viewBox="{-LEFT} {-HEAD} {LEFT + RIGHT} {layout.height + HEAD + 1}"
    style:width="{LEFT + RIGHT}mm"
    role="img"
    aria-label="Timeline of work, education and creative practice, from {layout.ticks[0].year} to today"
>
    <text class="head" x={-9} y={-2.5} text-anchor="end">Work & education</text>
    <text class="head" x={9} y={-2.5}>Creative</text>

    <line class="axis" y1={layout.axis.top} y2={layout.axis.end} />
    <line class="tail" y1={layout.axis.end} y2={layout.axis.end + TAIL} />
    {#each layout.ticks as { year, y, labelled } (year)}
        <line class="axis tick" x1={-0.9} x2={0.9} y1={y} y2={y} />
        {#if labelled}<text class="year" x={-1.6} y={y + 0.8} text-anchor="end">{year}</text>{/if}
    {/each}

    {#each sides as { bars, labels, labelOffset, dir, anchor } (dir)}
        {#each bars as { offset, y1, y2, ongoing }, i (i)}
            <line class="bar" x1={dir * offset} x2={dir * offset} {y1} {y2} />
            <circle class="dot" cx={dir * offset} cy={y1} r={0.6} />
            {#if ongoing}
                <line class="tail" x1={dir * offset} x2={dir * offset} y1={y2} y2={y2 + TAIL} />
            {:else}
                <circle class="dot" cx={dir * offset} cy={y2} r={0.4} />
            {/if}
        {/each}
        {#each labels as { title, subtitle, y }, i (i)}
            <text class="title" x={dir * labelOffset} y={y + 2.4} text-anchor={anchor}>{title}</text>
            <text class="subtitle" x={dir * labelOffset} y={y + 5} text-anchor={anchor}>{subtitle}</text>
        {/each}
    {/each}
</svg>

<style>
    svg {
        display: block;
        max-width: 100%;
        height: auto;
        overflow: visible;
    }

    .axis {
        stroke: currentColor;
        stroke-width: 0.3;
    }

    .tick {
        stroke-width: 0.2;
    }

    .bar,
    .tail {
        stroke: currentColor;
        stroke-width: 0.45;
    }

    .tail {
        stroke: var(--tail, currentColor);
        stroke-dasharray: 0.8 0.8;
    }

    .dot {
        fill: currentColor;
    }

    text {
        fill: currentColor;
    }

    .head,
    .title {
        font-size: 2.8px;
        font-weight: 650;
    }

    .title {
        font-stretch: 85%;
    }

    .year,
    .subtitle {
        font-size: 2.05px;
    }

    /* Supporting text recedes: the sheet's dim ink where it has one. */
    .head,
    .year,
    .subtitle {
        fill: var(--dim, currentColor);
    }
</style>
