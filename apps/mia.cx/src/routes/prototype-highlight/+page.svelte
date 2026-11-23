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
        doubleClickWindow: 800,
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
    let doubleClickWindow = $state(start.doubleClickWindow);
    let reduced = $state(start.reduced);
    let pauseOnSelect = $state(start.pauseOnSelect);
    $effect(() =>
        saved.set({ leading, trailing, wpm, pad, radius, seekDelay, doubleClickWindow, reduced, pauseOnSelect }),
    );
    function resetKnobs() {
        ({ leading, trailing, wpm, pad, radius, seekDelay, doubleClickWindow, reduced, pauseOnSelect } = DEFAULTS);
    }

    // Double-click calibration: press-to-press intervals of Mia's own double-clicks, and of pairs she
    // means as two separate clicks. Kept in localStorage; Export copies them as JSON.
    const samples = persistentAtom<{ double: number[]; distinct: number[] }>(
        'prototype-highlight:clicks',
        { double: [], distinct: [] },
        { encode: JSON.stringify, decode: JSON.parse },
    );
    let clicks = $state(samples.get());
    $effect(() => samples.set($state.snapshot(clicks)));
    /** Downloads the samples as clicks.json; the clipboard is off limits on a plain-http dev server. */
    function exportClicks() {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([JSON.stringify(clicks)], { type: 'application/json' }));
        link.download = 'clicks.json';
        link.click();
        URL.revokeObjectURL(link.href);
    }
    const lastPress: Record<'double' | 'distinct', number | undefined> = { double: undefined, distinct: undefined };
    /** The second press of a pair records the gap since the first; pairs never overlap. */
    function press(kind: 'double' | 'distinct') {
        const now = performance.now();
        const first = lastPress[kind];
        if (first !== undefined && now - first < 3000) {
            clicks[kind].push(Math.round(now - first));
            lastPress[kind] = undefined;
        } else lastPress[kind] = now;
    }
    const median = (xs: number[]) => {
        const sorted = [...xs].sort((a, b) => a - b);
        return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : undefined;
    };
    const describe = (xs: number[]) =>
        xs.length ? `${xs.length} · ${Math.min(...xs)}–${Math.max(...xs)} ms · median ${median(xs)}` : 'none yet';
    /** Halfway between Mia's slowest double-click and her quickest pair of separate clicks. */
    const suggested = $derived(
        clicks.double.length && clicks.distinct.length
            ? Math.round((Math.max(...clicks.double) + Math.min(...clicks.distinct)) / 2)
            : undefined,
    );

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

    let prose: HTMLDivElement;
    /**
     * One overlay above the whole page, in document coordinates: the blocks, then a copy of the page
     * in the block's text colour, cut to the blocks each frame. It sits on top of everything, so it
     * needs no stacking tricks to work over the header, the footer or anything else.
     */
    let overlay: HTMLDivElement;
    let layer: HTMLDivElement;
    let clone: HTMLDivElement;

    /** Copies the live page into the overlay. Run when a selection or narration starts, and on resize. */
    function refreshClone() {
        const copy = document.createElement('div');
        copy.className = 'hl-clone';
        copy.inert = true;
        for (const child of document.body.children)
            if (child !== overlay && !(child instanceof HTMLScriptElement)) copy.append(child.cloneNode(true));
        for (const el of copy.querySelectorAll('[id]')) el.removeAttribute('id');
        copy.style.clipPath = clone?.style.clipPath ?? `path('M0 0Z')`;
        clone?.replaceWith(copy) ?? overlay.append(copy);
        clone = copy;
    }

    /** Text the custom highlight covers: anywhere on the page but form fields and the overlay. */
    const selectable = (node: Node | null) =>
        !!node && !overlay.contains(node) && !(node instanceof Element ? node : node.parentElement)?.closest('input, textarea');

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

    /** A rect in document coordinates, padded. */
    function local(rect: DOMRect | Edges): Edges {
        const { l, r, t, b } = 'l' in rect ? rect : { l: rect.left, r: rect.right, t: rect.top, b: rect.bottom };
        return { l: l + scrollX - pad, r: r + scrollX + pad, t: t + scrollY - pad / 2, b: b + scrollY + pad / 2 };
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
        if (!started) refreshClone();
        started = true;
        playing = true;
        pausedBySelection = false;
    }
    function restart() {
        clock = 0;
        index = -1;
        play();
    }

    // Click to seek: the block moves now, the "audio" (the clock) follows after seekDelay. A second
    // press makes it a double-click instead: no seek, the audio pauses and the browser selects.
    let seekTimer: ReturnType<typeof setTimeout> | undefined;
    /** Where the audio was before the last click, until a double-click can no longer follow it. */
    let beforeClick: { clock: number; index: number } | undefined;
    let forgetTimer: ReturnType<typeof setTimeout> | undefined;
    /** Whether text was selected when the press began; by click time the press has cleared it. */
    let hadSelection = false;
    function onMouseDown(event: MouseEvent) {
        hadSelection = !getSelection()?.isCollapsed;
        if (event.detail < 2 || !beforeClick) return;
        // The second press of a double-click: drop the seek, or undo it if it already happened.
        clearTimeout(seekTimer);
        pending = false;
        ({ clock, index } = beforeClick);
        beforeClick = undefined;
        if (playing) {
            playing = false;
            pausedBySelection = true;
        }
    }
    function onClick(event: MouseEvent) {
        if (!started || event.detail !== 1) return;
        if ((event.target as Element).closest('a, button')) return;
        // A click that clears a selection only deselects; one that ends a drag only selects.
        if (hadSelection || !getSelection()?.isCollapsed) return;
        const caret = document.caretPositionFromPoint?.(event.clientX, event.clientY);
        const node = caret?.offsetNode;
        const i = words.findIndex((w) => w.node === node && w.from <= caret!.offset && caret!.offset <= w.to);
        if (i < 0) return;
        beforeClick = { clock, index };
        clearTimeout(forgetTimer);
        // A second press after the window is a new click, not the end of a double-click.
        forgetTimer = setTimeout(() => (beforeClick = undefined), doubleClickWindow);
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

    /** The rects of the selected text alone, without the boxes of elements it covers whole. */
    function textRects(range: Range) {
        const out: { rect: DOMRect; node: Text }[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
            if (!node.data.trim() || !range.intersectsNode(node) || !selectable(node)) continue;
            if (node.parentElement?.closest('script, style, noscript')) continue;
            const part = document.createRange();
            part.setStart(node, node === range.startContainer ? range.startOffset : 0);
            part.setEnd(node, node === range.endContainer ? range.endOffset : node.length);
            for (const rect of part.getClientRects()) if (rect.width >= 1) out.push({ rect, node });
        }
        return out;
    }

    const headingLevel = (el: Element) => Number(/^H([1-6])$/.exec(el.tagName)?.[1] ?? 0);

    /**
     * The prose's top-level elements that sit in a heading section the selection covers whole: the
     * heading and everything after it up to the next heading of the same or a higher level.
     */
    function wholeSections(selection: Selection) {
        const range = selection.getRangeAt(0);
        const kids = [...prose.children];
        const whole = new Set<Element>();
        kids.forEach((heading, i) => {
            const level = headingLevel(heading);
            if (!level) return;
            const members = [heading];
            for (const kid of kids.slice(i + 1)) {
                const next = headingLevel(kid);
                if (next && next <= level) break;
                members.push(kid);
            }
            if (members.every((member) => covers(range, member))) members.forEach((m) => whole.add(m));
        });
        return whole;
    }

    /**
     * Whether the selection covers all of an element's text. Browsers move a selection's ends into
     * the nearest text, so comparing against the element's own boundaries would never match.
     */
    function covers(range: Range, el: Element) {
        const texts: Text[] = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null)
            if (node.data.trim()) texts.push(node);
        if (!texts.length) return range.intersectsNode(el);
        const own = document.createRange();
        own.setStart(texts[0], texts[0].data.search(/\S/));
        own.setEnd(texts.at(-1)!, texts.at(-1)!.data.trimEnd().length);
        return (
            range.compareBoundaryPoints(Range.START_TO_START, own) <= 0 &&
            range.compareBoundaryPoints(Range.END_TO_END, own) >= 0
        );
    }

    let selectionFrame = 0;
    function onSelectionChange() {
        cancelAnimationFrame(selectionFrame);
        selectionFrame = requestAnimationFrame(() => {
            const selection = getSelection();
            const inside = selection && !selection.isCollapsed && selectable(selection.anchorNode);
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
            if (mode !== 'selection') refreshClone();
            mode = 'selection';
            if (pauseOnSelect && playing) {
                playing = false;
                pausedBySelection = true;
            }
            highlightWord(index);
            // One block per line of selected text, as wide as that line's text and never wider.
            const range = selection.getRangeAt(0);
            const lines: (Edges & { block: Element | null; top: Element | null })[] = [];
            for (const { rect, node } of textRects(range)) {
                const line = lines.find((l) => Math.abs(l.t - rect.top) < 4);
                if (line) {
                    line.l = Math.min(line.l, rect.left);
                    line.r = Math.max(line.r, rect.right);
                    line.b = Math.max(line.b, rect.bottom);
                    continue;
                }
                const parent = node.parentElement!;
                lines.push({
                    l: rect.left,
                    r: rect.right,
                    t: rect.top,
                    b: rect.bottom,
                    block: parent.closest('p, li, h1, h2, h3, h4, h5, h6, blockquote, pre'),
                    top: [...prose.children].find((kid) => kid.contains(parent)) ?? null,
                });
            }
            clearTimeout(wrapTimer);
            setEdges(tail, null);
            block(0);
            lines.sort((a, b) => a.t - b.t);
            const targets = lines.map(local);
            // Gaps fill in levels: between the lines of a paragraph the selection covers whole, then
            // between paragraphs once their whole heading section is selected. Every row keeps its width.
            const whole = wholeSections(selection);
            for (let i = 0; i < targets.length - 1; i++) {
                const [here, next] = [lines[i], lines[i + 1]];
                const sameBlock = here.block && here.block === next.block && covers(range, here.block);
                const sameSection = here.top && next.top && whole.has(here.top) && whole.has(next.top);
                if (sameBlock || sameSection) targets[i].b = Math.max(targets[i].b, targets[i + 1].t);
            }
            const placed = new Map<Edges, Block>();
            // A block stays on the line it already covers, so extending up or down never shifts the others.
            for (const to of targets) {
                const same = blocks.find((b) => b.at && ![...placed.values()].includes(b) && Math.abs(b.at.t - to.t) < 4);
                if (same) placed.set(to, same);
            }
            for (const to of targets) {
                if (placed.has(to)) continue;
                const taken = [...placed.values()];
                // The narration block travels to the selection's first new line; other lines grow in place.
                const head = blocks[0];
                if (head.at && !taken.includes(head)) {
                    placed.set(to, head);
                    continue;
                }
                const fresh = blocks.find((b) => !b.at && !taken.includes(b)) ?? block(blocks.length);
                // A new line grows out of the side joined to the rest of the selection.
                const above = taken.some((b) => b.at!.t > to.t);
                setEdges(fresh, above ? { ...to, l: to.r } : { ...to, r: to.l }, true);
                placed.set(to, fresh);
            }
            for (const [to, b] of placed) setEdges(b, to);
            for (const b of blocks) if (![...placed.values()].includes(b)) setEdges(b, null);
        });
    }

    onMount(() => {
        overlay = document.createElement('div');
        overlay.className = 'hl-overlay';
        overlay.ariaHidden = 'true';
        layer = document.createElement('div');
        layer.className = 'hl-layer';
        overlay.append(layer);
        document.body.append(overlay);
        refreshClone();
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
        const onResize = () => {
            refreshClone();
            if (mode === 'selection') onSelectionChange();
            else if (index >= 0) setEdges(0, local(words[index].range.getClientRects()[0]), true);
        };
        // A selection in the fixed header moves against the document as the page scrolls.
        const onScroll = () => mode === 'selection' && onSelectionChange();
        document.addEventListener('selectionchange', onSelectionChange);
        // Capture, so it reads the selection before the press clears it.
        document.addEventListener('mousedown', onMouseDown, true);
        addEventListener('resize', onResize);
        addEventListener('scroll', onScroll, { passive: true });
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('selectionchange', onSelectionChange);
            document.removeEventListener('mousedown', onMouseDown, true);
            removeEventListener('resize', onResize);
            removeEventListener('scroll', onScroll);
            CSS.highlights.clear();
            overlay.remove();
        };
    });
</script>

<svelte:head><title>Prototype: highlight block</title></svelte:head>

<main class="container">
    <p class="badge mono">Prototype · fake narration · #66</p>
    <h1>{data.post.title}</h1>

    <!-- eslint-disable-next-line svelte/no-at-html-tags, svelte/valid-compile -- prototype -->
    <div class="prose proto-prose" bind:this={prose} onclick={onClick} role="presentation">
        {@html data.html}
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
    <div class="knob">Double-click window <span><input type="number" min="0" bind:value={doubleClickWindow} /> ms</span><input type="range" min="100" max="1500" bind:value={doubleClickWindow} /></div>
    <section class="calibrate">
        <p>Double-click the left one as you'd double-click a word. Click the right one twice, as two separate clicks.</p>
        <div class="row">
            <button onmousedown={() => press('double')}>Double-click</button>
            <button onmousedown={() => press('distinct')}>Two clicks</button>
        </div>
        <dl>
            <dt>Double</dt><dd>{describe(clicks.double)}</dd>
            <dt>Two</dt><dd>{describe(clicks.distinct)}</dd>
            <dt>Cutoff</dt><dd>{suggested === undefined ? 'needs both' : `${suggested} ms`}</dd>
        </dl>
        <div class="row">
            <button disabled={suggested === undefined} onclick={() => (doubleClickWindow = suggested!)}>Use cutoff</button>
            <button onclick={exportClicks}>Export</button>
            <button onclick={() => (clicks = { double: [], distinct: [] })}>Clear</button>
        </div>
    </section>
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
    /* The blocks draw every selection on the page; form fields and Windows high contrast keep the native one. */
    :global(::selection) {
        background: transparent;
    }
    :global(input::selection, textarea::selection) {
        background: Highlight;
        color: HighlightText;
    }
    @media (forced-colors: active) {
        :global(::selection) {
            background: Highlight;
        }
        :global(.hl-overlay) {
            display: none;
        }
    }
    :global(.hl-overlay) {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 0;
        z-index: 2147483000;
        pointer-events: none;
        user-select: none;
    }
    :global(.hl-layer) {
        position: absolute;
        inset: 0;
    }
    :global(.hl-block) {
        position: absolute;
        display: none;
        background: var(--accent);
    }
    :global(.hl-clone) {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        clip-path: path('M0 0Z');
    }
    /* The copy is only the text, in the block's colour: no backgrounds, borders, images or effects. */
    :global(.hl-clone *) {
        color: var(--bg) !important;
        -webkit-text-fill-color: var(--bg) !important;
        text-decoration-color: var(--bg) !important;
        background: transparent !important;
        border-color: transparent !important;
        box-shadow: none !important;
        text-shadow: none !important;
        backdrop-filter: none !important;
        filter: none !important;
        mask: none !important;
    }
    :global(.hl-clone :is(canvas, img, video, picture)) {
        visibility: hidden !important;
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
    .calibrate {
        display: grid;
        gap: 8px;
        padding-top: 10px;
        border-top: 1px solid var(--panel-line);
    }
    .calibrate p {
        color: var(--ink-dim);
        text-transform: none;
        letter-spacing: 0;
        line-height: 1.4;
    }
    .calibrate button:disabled {
        opacity: 0.4;
        cursor: default;
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
