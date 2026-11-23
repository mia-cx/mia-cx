<!--
    PROTOTYPE (throwaway, never merges): the highlight block from #66, following a fake narration
    and doubling as the selection highlight. Tune it with the panel bottom right.
-->
<script lang="ts">
    import '$lib/styles/prose.css';
    import { persistentAtom } from '@nanostores/persistent';
    import { onMount } from 'svelte';

    let { data } = $props();

    // Knobs, kept in localStorage so a reload or HMR keeps them.
    const DEFAULTS = {
        leading: 90,
        trailing: 170,
        wpm: 170,
        pad: 3,
        radius: 4,
        seekDelay: 250,
        reduced: false,
        pauseOnSelect: true,
    };
    const saved = persistentAtom('prototype-highlight:knobs', DEFAULTS, {
        encode: JSON.stringify,
        decode: (raw) => ({ ...DEFAULTS, ...JSON.parse(raw) }),
    });
    const start = saved.get();
    let leading = $state(start.leading);
    let trailing = $state(start.trailing);
    let wpm = $state(start.wpm);
    let pad = $state(start.pad);
    let radius = $state(start.radius);
    let seekDelay = $state(start.seekDelay);
    let reduced = $state(start.reduced);
    let pauseOnSelect = $state(start.pauseOnSelect);
    $effect(() => saved.set({ leading, trailing, wpm, pad, radius, seekDelay, reduced, pauseOnSelect }));
    function resetKnobs() {
        ({ leading, trailing, wpm, pad, radius, seekDelay, reduced, pauseOnSelect } = DEFAULTS);
    }

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
    let clone: HTMLDivElement;

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
    type Edge = keyof Edges;
    const EDGES: Edge[] = ['l', 'r', 't', 'b'];
    interface Tween {
        from: number;
        to: number;
        start: number;
        dur: number;
    }
    /** `at` is where the block is heading; `tweens` animate each edge there on its own clock. */
    interface Block {
        el: HTMLDivElement;
        at: Edges | null;
        tweens: Record<Edge, Tween> | null;
    }
    const blocks: Block[] = [];
    function makeBlock(): Block {
        const el = document.createElement('div');
        el.className = 'hl-block';
        layer.append(el);
        return { el, at: null, tweens: null };
    }
    function block(i: number) {
        while (blocks.length <= i) blocks.push(makeBlock());
        return blocks[i];
    }
    /** Shrinks out of the old line at a wrap while block 0 already grows on the new one. */
    let tail: Block;

    /** Close to cubic-bezier(.2, .9, .3, 1): fast out, soft landing. */
    const ease = (x: number) => 1 - (1 - x) ** 4;
    const valueOf = ({ from, to, start, dur }: Tween, now: number) =>
        dur <= 0 || now >= start + dur ? to : from + (to - from) * ease((now - start) / dur);

    /**
     * Draws every block where its edges are this frame, and clips the dark copy of the prose to the
     * same rectangles, so text turns dark exactly where a block covers it.
     */
    function render(now: number) {
        const rects: Edges[] = [];
        for (const { el, at, tweens } of [...blocks, tail]) {
            if (!at || !tweens) {
                el.style.display = 'none';
                continue;
            }
            const [l, r, t, b] = EDGES.map((edge) => valueOf(tweens[edge], now));
            el.style.display = 'block';
            el.style.left = `${l}px`;
            el.style.top = `${t}px`;
            el.style.width = `${Math.max(0, r - l)}px`;
            el.style.height = `${Math.max(0, b - t)}px`;
            el.style.borderRadius = `${radius}px`;
            if (r - l > 0.5) rects.push({ l, r, t, b });
        }
        const path = rects.map(({ l, r, t, b }) => `M${l} ${t}H${r}V${b}H${l}Z`).join(' ');
        clone.style.clipPath = `path('${path || 'M0 0Z'}')`;
    }

    /** A rect in the wrapper's coordinates, padded. */
    function local(rect: DOMRect | Edges): Edges {
        const box = wrapper.getBoundingClientRect();
        const { l, r, t, b } = 'l' in rect ? rect : { l: rect.left, r: rect.right, t: rect.top, b: rect.bottom };
        return { l: l - box.left - pad, r: r - box.left + pad, t: t - box.top - pad / 2, b: b - box.top + pad / 2 };
    }

    /** Moves a block's edges: an edge moving outward leads, an edge moving inward trails. */
    function setEdges(which: number | Block, to: Edges | null, snap = false) {
        const b = typeof which === 'number' ? block(which) : which;
        if (!to) {
            b.at = null;
            b.tweens = null;
            return;
        }
        const now = performance.now();
        const current = b.tweens;
        const instant = snap || reduced || !current;
        const durations: Record<Edge, number> = {
            l: to.l < (b.at?.l ?? to.l) ? leading : trailing,
            r: to.r > (b.at?.r ?? to.r) ? leading : trailing,
            t: trailing,
            b: trailing,
        };
        b.tweens = Object.fromEntries(
            EDGES.map((edge) => {
                const from = instant ? to[edge] : valueOf(current![edge], now);
                return [edge, { from, to: to[edge], start: now, dur: instant ? 0 : durations[edge] }];
            }),
        ) as Record<Edge, Tween>;
        b.at = to;
    }

    let wrapTimer: ReturnType<typeof setTimeout> | undefined;
    /**
     * Block 0 to word i. Across a line wrap the old shape passes to the tail, which shrinks into the
     * old line, while block 0 grows out of the new line at the same moment.
     */
    function moveTo(i: number) {
        const rect = words[i]?.range.getClientRects()[0];
        if (!rect) return;
        const to = local(rect);
        const head = block(0);
        const from = head.at;
        const sameLine = from && Math.abs(from.t - to.t) < 4;
        if (!from || sameLine || reduced) return setEdges(0, to);
        const forward = to.t > from.t;
        clearTimeout(wrapTimer);
        tail.at = from;
        tail.tweens = head.tweens;
        const edge = forward ? from.r : from.l;
        setEdges(tail, { ...from, l: edge, r: edge });
        wrapTimer = setTimeout(() => setEdges(tail, null), trailing);
        const start = forward ? to.l : to.r;
        setEdges(0, { ...to, l: start, r: start }, true);
        setEdges(0, to);
    }

    /** While a selection holds the block, the spoken word gets a quieter underline instead. */
    function highlightWord(i: number) {
        const word = words[i];
        CSS.highlights.delete('hl-quiet');
        if (word && mode === 'selection') CSS.highlights.set('hl-quiet', new Highlight(word.range));
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
    /** Whether text was selected when the press began; by click time the press has cleared it. */
    let hadSelection = false;
    const onPointerDown = () => (hadSelection = !getSelection()?.isCollapsed);
    function onClick(event: MouseEvent) {
        if (!started) return;
        if (event.detail !== 1) {
            clearTimeout(seekTimer);
            pending = false;
            return;
        }
        if ((event.target as Element).closest('a, button')) return;
        // A click that clears a selection only deselects; one that ends a drag only selects.
        if (hadSelection || !getSelection()?.isCollapsed) return;
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
            setEdges(tail, null);
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
        tail = makeBlock();
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
            render(now);
            frame = requestAnimationFrame(tick);
        });
        const onResize = () => mode === 'narration' && index >= 0 && setEdges(0, local(words[index].range.getClientRects()[0]), true);
        document.addEventListener('selectionchange', onSelectionChange);
        // Capture, so it reads the selection before the press clears it.
        document.addEventListener('pointerdown', onPointerDown, true);
        addEventListener('resize', onResize);
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('selectionchange', onSelectionChange);
            document.removeEventListener('pointerdown', onPointerDown, true);
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
        <!-- The same prose in the block's text colour, clipped to the blocks each frame. -->
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- prototype -->
        <div class="prose clone" bind:this={clone} aria-hidden="true">{@html data.html}</div>
    </div>
</main>

<aside class="panel mono">
    <div class="row">
        <button onclick={() => (playing ? ((playing = false), (pausedBySelection = false)) : play())}>
            {playing ? 'Pause' : started ? 'Resume' : 'Play'}
        </button>
        <button onclick={restart}>Restart</button>
        <button onclick={resetKnobs}>Defaults</button>
    </div>
    <!-- Each knob is a slider plus a number field for typing an exact value, past the slider's range too. -->
    <div class="knob">Leading edge <span><input type="number" min="0" bind:value={leading} /> ms</span><input type="range" min="20" max="400" bind:value={leading} /></div>
    <div class="knob">Trailing edge <span><input type="number" min="0" bind:value={trailing} /> ms</span><input type="range" min="20" max="600" bind:value={trailing} /></div>
    <div class="knob">Voice speed <span><input type="number" min="1" bind:value={wpm} /> wpm</span><input type="range" min="60" max="400" bind:value={wpm} /></div>
    <div class="knob">Seek delay <span><input type="number" min="0" bind:value={seekDelay} /> ms</span><input type="range" min="0" max="600" bind:value={seekDelay} /></div>
    <div class="knob">Padding <span><input type="number" min="0" step="0.5" bind:value={pad} /> px</span><input type="range" min="0" max="10" step="0.5" bind:value={pad} /></div>
    <div class="knob">Corner radius <span><input type="number" min="0" bind:value={radius} /> px</span><input type="range" min="0" max="14" bind:value={radius} /></div>
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
        display: none;
        background: var(--accent);
    }
    /* Both copies keep their paragraphs' margins inside, so their lines sit at the same height. */
    .proto-prose,
    .clone {
        display: flow-root;
    }
    .proto-prose :global(::selection) {
        background: transparent;
    }
    .clone {
        position: absolute;
        inset: 0;
        pointer-events: none;
        user-select: none;
        clip-path: path('M0 0Z');
        color: var(--bg);
    }
    .clone :global(*) {
        color: var(--bg) !important;
        text-decoration-color: var(--bg) !important;
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
    .knob {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 2px 8px;
    }
    .knob input[type='range'] {
        grid-column: 1 / -1;
    }
    .knob span {
        color: var(--ink-dim);
    }
    .knob input[type='number'] {
        box-sizing: content-box;
        width: 6ch;
        padding: 2px 6px;
        border: 1px solid color-mix(in oklab, var(--ink) 30%, transparent);
        color: var(--ink);
        background: none;
        font: inherit;
        text-align: right;
        /* No spinner arrows: they eat the field's width. Typing and arrow keys still work. */
        appearance: textfield;
    }
    .knob input[type='number']::-webkit-inner-spin-button,
    .knob input[type='number']::-webkit-outer-spin-button {
        appearance: none;
        margin: 0;
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
