<!--
    PROTOTYPE (throwaway, never merges): the highlight block from #66, following a fake narration
    and doubling as the selection highlight. Tune it with the panel bottom right.
-->
<script lang="ts">
    import '$lib/styles/prose.css';
    import { onMount } from 'svelte';

    let { data } = $props();

    // Knobs.
    let leading = $state(90);
    let trailing = $state(170);
    let wpm = $state(170);
    let pad = $state(3);
    let radius = $state(4);
    let seekDelay = $state(250);
    let reduced = $state(false);
    let pauseOnSelect = $state(true);

    // State, shown in the panel.
    let playing = $state(false);
    let started = $state(false);
    let index = $state(-1);
    let clock = $state(0);
    let mode = $state<'narration' | 'selection'>('narration');
    let pending = $state(false);
    let pausedBySelection = $state(false);
    let total = $state(0);
    let wordCount = $state(0);

    let wrapper: HTMLDivElement;
    let layer: HTMLDivElement;
    let prose: HTMLDivElement;

    interface Word {
        range: Range;
        node: Text;
        from: number;
        to: number;
        start: number;
    }
    let words: Word[] = [];
    const BASE_WPM = 170;

    /** Every word in the prose with a fake start time, as if a voice read it at BASE_WPM. */
    function collectWords() {
        const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => (node.parentElement?.closest('pre') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
        });
        const perWord = 60 / BASE_WPM;
        let time = 0.4;
        let block: Element | null = null;
        for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
            const here = node.parentElement?.closest('p, li, h1, h2, h3, h4, blockquote') ?? null;
            if (block && here !== block) time += 0.45; // a breath between paragraphs and headings
            block = here;
            for (const match of node.data.matchAll(/\S+/g)) {
                const range = document.createRange();
                range.setStart(node, match.index);
                range.setEnd(node, match.index + match[0].length);
                words.push({ range, node, from: match.index, to: match.index + match[0].length, start: time });
                time += perWord * (0.55 + 0.07 * Math.min(match[0].length, 12));
                if (/[.!?]["')]?$/.test(match[0])) time += 0.35;
                else if (/[,;:)]$/.test(match[0])) time += 0.15;
            }
        }
        total = time;
        wordCount = words.length;
    }

    // Blocks: block 0 follows the voice; selections use as many as they have lines.
    interface Edges {
        l: number;
        r: number;
        t: number;
        b: number;
    }
    const blocks: { el: HTMLDivElement; at: Edges | null }[] = [];
    function block(i: number) {
        while (blocks.length <= i) {
            const el = document.createElement('div');
            el.className = 'hl-block';
            layer.append(el);
            blocks.push({ el, at: null });
        }
        return blocks[i];
    }

    /** A rect in the wrapper's coordinates, padded. */
    function local(rect: DOMRect | Edges): Edges {
        const box = wrapper.getBoundingClientRect();
        const { l, r, t, b } = 'l' in rect ? rect : { l: rect.left, r: rect.right, t: rect.top, b: rect.bottom };
        return { l: l - box.left - pad, r: r - box.left + pad, t: t - box.top - pad / 2, b: b - box.top + pad / 2 };
    }

    /** Moves a block's edges: an edge moving outward leads, an edge moving inward trails. */
    function setEdges(i: number, to: Edges | null, snap = false) {
        const b = block(i);
        const { el } = b;
        if (!to) {
            el.style.opacity = '0';
            b.at = null;
            return;
        }
        const from = b.at;
        const width = wrapper.clientWidth;
        if (snap || reduced || !from) {
            el.style.transition = 'none';
        } else {
            const leftMs = to.l < from.l ? leading : trailing;
            const rightMs = to.r > from.r ? leading : trailing;
            const ease = 'cubic-bezier(.2,.9,.3,1)';
            el.style.transition = `left ${leftMs}ms ${ease}, right ${rightMs}ms ${ease}, top ${trailing}ms ${ease}, bottom ${trailing}ms ${ease}, opacity 120ms`;
        }
        el.style.left = `${to.l}px`;
        el.style.right = `${width - to.r}px`;
        el.style.top = `${to.t}px`;
        el.style.bottom = `${wrapper.clientHeight - to.b}px`;
        el.style.borderRadius = `${radius}px`;
        el.style.opacity = '1';
        if (snap) void el.offsetWidth; // commit the snap before the next transition
        b.at = to;
    }

    let wrapTimer: ReturnType<typeof setTimeout> | undefined;
    /** Block 0 to word i. Across a line wrap it shrinks into the old line and grows out of the new one. */
    function moveTo(i: number) {
        clearTimeout(wrapTimer);
        const rect = words[i]?.range.getClientRects()[0];
        if (!rect) return;
        const to = local(rect);
        const from = block(0).at;
        const sameLine = from && Math.abs(from.t - to.t) < 4;
        if (!from || sameLine || reduced) return setEdges(0, to);
        const forward = to.t > from.t;
        const edge = forward ? from.r : from.l;
        setEdges(0, { ...from, l: edge, r: edge });
        wrapTimer = setTimeout(() => {
            const start = forward ? to.l : to.r;
            setEdges(0, { ...to, l: start, r: start }, true);
            setEdges(0, to);
        }, trailing);
    }

    function highlightWord(i: number) {
        const word = words[i];
        CSS.highlights.delete('hl-word');
        CSS.highlights.delete('hl-quiet');
        if (!word) return;
        CSS.highlights.set(mode === 'narration' ? 'hl-word' : 'hl-quiet', new Highlight(word.range));
    }

    function wordAt(time: number) {
        let lo = 0;
        let hi = words.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (words[mid].start <= time) lo = mid;
            else hi = mid - 1;
        }
        return lo;
    }

    function play() {
        started = true;
        playing = true;
        pausedBySelection = false;
    }
    function restart() {
        clock = 0;
        index = -1;
        play();
    }

    // Click to seek: the block moves now, the "audio" (the clock) follows after seekDelay unless a
    // second click turns it into a double-click.
    let seekTimer: ReturnType<typeof setTimeout> | undefined;
    function onClick(event: MouseEvent) {
        if (!started) return;
        if (event.detail !== 1) {
            clearTimeout(seekTimer);
            pending = false;
            return;
        }
        if ((event.target as Element).closest('a, button')) return;
        if (!getSelection()?.isCollapsed) return;
        const caret = document.caretPositionFromPoint?.(event.clientX, event.clientY);
        const node = caret?.offsetNode;
        const i = words.findIndex((w) => w.node === node && w.from <= caret!.offset && caret!.offset <= w.to);
        if (i < 0) return;
        pending = true;
        moveTo(i);
        highlightWord(i);
        clearTimeout(seekTimer);
        seekTimer = setTimeout(() => {
            pending = false;
            clock = words[i].start;
            index = i;
        }, seekDelay);
    }

    let selectionFrame = 0;
    function onSelectionChange() {
        cancelAnimationFrame(selectionFrame);
        selectionFrame = requestAnimationFrame(() => {
            const selection = getSelection();
            const inside = selection && !selection.isCollapsed && prose.contains(selection.anchorNode);
            if (!inside) {
                if (mode === 'selection') {
                    mode = 'narration';
                    for (let i = 1; i < blocks.length; i++) setEdges(i, null);
                    if (index >= 0) {
                        moveTo(index);
                        highlightWord(index);
                    } else setEdges(0, null);
                    if (pausedBySelection) play();
                }
                return;
            }
            mode = 'selection';
            if (pauseOnSelect && playing) {
                playing = false;
                pausedBySelection = true;
            }
            highlightWord(index);
            // One block per line: merge the selection's rects that share a line.
            const lines: Edges[] = [];
            for (const rect of selection.getRangeAt(0).getClientRects()) {
                if (rect.width < 1) continue;
                const line = lines.find((l) => Math.abs(l.t - rect.top) < 4);
                if (line) {
                    line.l = Math.min(line.l, rect.left);
                    line.r = Math.max(line.r, rect.right);
                    line.b = Math.max(line.b, rect.bottom);
                } else lines.push({ l: rect.left, r: rect.right, t: rect.top, b: rect.bottom });
            }
            clearTimeout(wrapTimer);
            lines.forEach((line, i) => {
                const to = local(line);
                // A new line's block grows out of the side the selection is coming from.
                if (!block(i).at) setEdges(i, { ...to, r: to.l }, true);
                setEdges(i, to);
            });
            for (let i = lines.length; i < blocks.length; i++) setEdges(i, null);
        });
    }

    onMount(() => {
        collectWords();
        let last = performance.now();
        let frame = requestAnimationFrame(function tick(now) {
            const dt = (now - last) / 1000;
            last = now;
            if (playing && !pending) {
                clock += dt * (wpm / BASE_WPM);
                if (clock >= total) playing = false;
                const i = wordAt(clock);
                if (i !== index && words[i].start <= clock) {
                    index = i;
                    if (mode === 'narration') moveTo(i);
                    highlightWord(i);
                }
            }
            frame = requestAnimationFrame(tick);
        });
        const onResize = () => mode === 'narration' && index >= 0 && setEdges(0, local(words[index].range.getClientRects()[0]), true);
        document.addEventListener('selectionchange', onSelectionChange);
        addEventListener('resize', onResize);
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('selectionchange', onSelectionChange);
            removeEventListener('resize', onResize);
            CSS.highlights.clear();
        };
    });
</script>

<svelte:head><title>Prototype: highlight block</title></svelte:head>

<main class="container">
    <p class="badge mono">Prototype · fake narration · #66</p>
    <h1>{data.post.title}</h1>

    <div class="wrapper" bind:this={wrapper}>
        <div class="layer" bind:this={layer} aria-hidden="true"></div>
        <!-- eslint-disable-next-line svelte/no-at-html-tags, svelte/valid-compile -- prototype -->
        <div class="prose proto-prose" bind:this={prose} onclick={onClick} role="presentation">
            {@html data.html}
        </div>
    </div>
</main>

<aside class="panel mono">
    <div class="row">
        <button onclick={() => (playing ? ((playing = false), (pausedBySelection = false)) : play())}>
            {playing ? 'Pause' : started ? 'Resume' : 'Play'}
        </button>
        <button onclick={restart}>Restart</button>
    </div>
    <label>Leading edge <span>{leading} ms</span><input type="range" min="20" max="400" bind:value={leading} /></label>
    <label>Trailing edge <span>{trailing} ms</span><input type="range" min="20" max="600" bind:value={trailing} /></label>
    <label>Voice speed <span>{wpm} wpm</span><input type="range" min="60" max="400" bind:value={wpm} /></label>
    <label>Seek delay <span>{seekDelay} ms</span><input type="range" min="0" max="600" bind:value={seekDelay} /></label>
    <label>Padding <span>{pad} px</span><input type="range" min="0" max="10" bind:value={pad} /></label>
    <label>Corner radius <span>{radius} px</span><input type="range" min="0" max="14" bind:value={radius} /></label>
    <label class="check"><input type="checkbox" bind:checked={reduced} /> Reduced motion</label>
    <label class="check"><input type="checkbox" bind:checked={pauseOnSelect} /> Pause narration while selecting</label>
    <dl>
        <dt>Mode</dt><dd>{mode}{pending ? ' · seek pending' : ''}{pausedBySelection ? ' · paused by selection' : ''}</dd>
        <dt>Word</dt><dd>{index + 1} / {wordCount || '…'}</dd>
        <dt>Time</dt><dd>{clock.toFixed(1)} / {total.toFixed(1)} s</dd>
    </dl>
</aside>

<style>
    main {
        padding-top: calc(var(--header-height) + clamp(20px, 4vh, 40px));
        padding-bottom: 40vh;
    }
    .badge {
        margin-top: 16px;
        color: var(--accent);
    }
    h1 {
        margin: 24px 0 40px;
        font-size: clamp(32px, 5.6vw, 68px);
        font-weight: 640;
        font-stretch: 74%;
        line-height: 0.95;
        letter-spacing: -0.02em;
    }
    .wrapper {
        position: relative;
        isolation: isolate;
    }
    .layer {
        position: absolute;
        inset: 0;
        z-index: -1;
        pointer-events: none;
    }
    .layer :global(.hl-block) {
        position: absolute;
        background: var(--accent);
        opacity: 0;
    }
    .proto-prose :global(::selection) {
        background: transparent;
        color: var(--bg);
    }
    :global(::highlight(hl-word)) {
        color: var(--bg);
    }
    :global(::highlight(hl-quiet)) {
        text-decoration: underline 2px var(--accent);
        text-underline-offset: 4px;
    }
    .panel {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 50;
        display: grid;
        gap: 8px;
        width: min(300px, calc(100vw - 32px));
        padding: 14px;
        border: 1px solid var(--panel-line);
        background: color-mix(in oklab, var(--bg) 88%, transparent);
        backdrop-filter: blur(12px);
        font-size: 12px;
    }
    .row {
        display: flex;
        gap: 8px;
    }
    .row button {
        flex: 1;
        padding: 6px;
        border: 1px solid var(--panel-line);
        color: var(--ink);
        background: none;
        font: inherit;
        cursor: pointer;
    }
    label {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 2px 8px;
    }
    label input[type='range'] {
        grid-column: 1 / -1;
    }
    label span {
        color: var(--ink-dim);
    }
    .check {
        display: flex;
        gap: 8px;
        align-items: center;
    }
    dl {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 2px 10px;
        margin: 4px 0 0;
        color: var(--ink-dim);
    }
    dd {
        margin: 0;
        color: var(--ink);
    }
</style>
