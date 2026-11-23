/**
 * `<mia-marker>`: one highlight for the text inside it, as the reader's selection and as a word
 * cursor a narration can drive.
 *
 *     <mia-marker class="prose">…article…</mia-marker>
 *     marker.word = 41; // highlight the 42nd word, e.g. from a narration's timings
 *     marker.addEventListener('seek', (e) => seekTo(e.detail.word)); // a click or tap on a word
 *
 * The highlight is a set of blocks drawn over the text, with the covered text redrawn in the block's
 * text colour, cut to the same shape every frame, so text changes colour exactly where a block covers
 * it. Each block hugs one line of text. A block's edges move on their own clocks: an edge moving
 * outward takes `leading` ms, an edge moving inward `trailing` ms.
 *
 * Attributes: `word` (index, -1 for none), `leading`, `trailing`, `stagger`, `double-click` (ms),
 * `padding`, `radius` (px). Colours: `--marker-color` and `--marker-text`.
 *
 * Selections come from the mouse or a touch long-press alike. While a word is highlighted, clicking or
 * tapping another word fires `seek`: a tap at once, a click once `double-click` ms pass without a
 * second click, since a double-click selects the word instead.
 *
 * The redrawn text is a copy of the marker's children inside it, so style the content with
 * descendant selectors (`.prose p`), not child selectors on the marker. Form fields and forced-colors
 * mode keep the native selection; reduced motion, or `data-motion="reduce"` on `<html>`, makes every
 * change snap.
 */
import { mergeLines, sameLine, shapePath, shrinkTarget, wipeOrder, type Edges, type Point } from './marker-geometry';

export const MARKER_TAG = 'mia-marker';

const STYLES = `
${MARKER_TAG} { display: block; position: relative; }
${MARKER_TAG} ::selection { background: transparent; }
${MARKER_TAG} :is(input, textarea)::selection { background: Highlight; color: HighlightText; }
${MARKER_TAG} > [data-marker-overlay] {
    position: absolute; inset: 0; z-index: 2147483647; pointer-events: none; user-select: none;
}
[data-marker-overlay] > * { position: absolute; inset: 0; clip-path: path('M0 0Z'); }
[data-marker-paint] { background: var(--marker-color, Highlight); }
[data-marker-copy] { box-sizing: border-box; color: var(--marker-text, HighlightText); visibility: hidden; }
[data-marker-copy] [data-marker-show] { visibility: visible; }
[data-marker-copy] * {
    color: inherit !important; -webkit-text-fill-color: currentColor !important;
    text-decoration-color: currentColor !important; background: transparent !important;
    border-color: transparent !important; box-shadow: none !important; text-shadow: none !important;
    filter: none !important; backdrop-filter: none !important; mix-blend-mode: normal !important;
}
[data-marker-copy] :is(img, video, canvas, picture, iframe) { visibility: hidden !important; }
::highlight(${MARKER_TAG}-word) {
    text-decoration: underline 2px var(--marker-color, Highlight); text-underline-offset: 4px;
}
@media (forced-colors: active) {
    ${MARKER_TAG} ::selection { background: Highlight; color: HighlightText; }
    ${MARKER_TAG} > [data-marker-overlay] { display: none; }
}
@media print {
    ${MARKER_TAG} > [data-marker-overlay] { display: none; }
}`;

/**
 * Whether a reader can see an element's text. Selections and word lists still include text faded to
 * nothing (a tooltip waiting for hover) or clipped to a pixel for screen readers; the highlight must not.
 */
function visible(el: Element) {
    // `visibility` inherits, so the text's own element already answers for every wrapper above it.
    if (getComputedStyle(el).visibility !== 'visible') return false;
    // A `display: contents` wrapper has no box of its own; its text shows as part of the parent's.
    let boxed: Element | null = el;
    while (boxed && getComputedStyle(boxed).display === 'contents') boxed = boxed.parentElement;
    if (!boxed?.checkVisibility({ opacityProperty: true })) return false;
    const box = boxed.getBoundingClientRect();
    return box.width > 1 || box.height > 1;
}

/** How far an italic glyph leans past its text box at the end of a run, in ems: about a 12° slant. */
const ITALIC_LEAN = 0.15;
/** Extra width at the end of a text run whose glyphs lean past their box. */
function overhang(node: Text) {
    const style = getComputedStyle(node.parentElement!);
    return /italic|oblique/.test(style.fontStyle) ? Number.parseFloat(style.fontSize) * ITALIC_LEAN : 0;
}

const DEFAULTS = { leading: 200, trailing: 200, stagger: 150, padding: 4, radius: 0, 'double-click': 330 };
type Setting = keyof typeof DEFAULTS;

type Edge = keyof Edges;
const EDGES: Edge[] = ['l', 'r', 't', 'b'];
interface Tween {
    from: number;
    to: number;
    start: number;
    dur: number;
}
/** Close to cubic-bezier(.2, .9, .3, 1): fast out, soft landing. */
const ease = (x: number) => 1 - (1 - x) ** 4;
const valueOf = ({ from, to, start, dur }: Tween, now: number) =>
    dur <= 0 || now >= start + dur ? to : from + (to - from) * ease((now - start) / dur);

interface Block {
    /** Where the block is heading; null when hidden. */
    at: Edges | null;
    tweens: Record<Edge, Tween> | null;
    /** Hides the block once it has shrunk away, or starts a staggered shrink; cleared on reuse. */
    fading?: ReturnType<typeof setTimeout>;
    /** The element holding the block's text and where it was, so the block can move when the element does. */
    ref?: { el: Element; x: number; y: number };
}
const newBlock = (): Block => ({ at: null, tweens: null });

/** Elements whose lines read as one unit: the gaps between their lines fill once wholly selected. */
const UNIT = 'p, li, dt, dd, blockquote, pre, figcaption, td, th, h1, h2, h3, h4, h5, h6';
const headingLevel = (el: Element) => Number(/^H([1-6])$/.exec(el.tagName)?.[1] ?? 0);
const reducedMotion = () =>
    matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce';

/** Registers `<mia-marker>`. Safe to call more than once, and a no-op on the server. */
export function defineMarker() {
    if (typeof customElements === 'undefined' || customElements.get(MARKER_TAG)) return;
    if (!document.querySelector('style[data-mia-marker]')) {
        const style = document.createElement('style');
        style.dataset.miaMarker = '';
        style.textContent = STYLES;
        document.head.append(style);
    }
    customElements.define(MARKER_TAG, createMarker());
}

/** The element class, built on demand so importing this module never touches the DOM. */
function createMarker() {
    return class Marker extends HTMLElement {
        static observedAttributes = ['word'];

        #overlay = document.createElement('div');
        #paint = document.createElement('div');
        #copy = document.createElement('div');
        #copyStale = true;
        #words: Range[] | undefined;
        /** Selection blocks; block 0 doubles as the word cursor. */
        #blocks: Block[] = [newBlock()];
        /** Shrinks out of the old line at a wrap while block 0 already grows on the new one. */
        #tail = newBlock();
        #selecting = false;
        #index = -1;
        #frame = 0;
        #selectionFrame = 0;
        #wrapTimer: ReturnType<typeof setTimeout> | undefined;
        /** Where a press that cleared the selection landed; the selection wipes toward it. */
        #deselectAt: Point | undefined;
        #mutations = new MutationObserver((records) => {
            if (records.every((r) => this.#overlay.contains(r.target))) return;
            this.#words = undefined;
            // The copy rebuilds on the next frame that draws, so a counter ticking elsewhere costs nothing.
            // A change to highlighted text itself, or one that removes it, has to draw now.
            this.#copyStale = true;
            const shown = [...this.#shown];
            const touchesShown = records.some(
                (r) =>
                    shown.some((el) => el.contains(r.target)) ||
                    [...r.removedNodes].some((node) => shown.some((el) => node.contains(el))),
            );
            if (touchesShown) this.#kick();
            // The cursor's index may now name another word, or none: retarget it without restarting its move.
            if (this.#index >= 0 && !this.#selecting && this.#seeking < 0) this.#placeCursor();
        });
        #resize = new ResizeObserver(() => {
            this.#copyStale = true;
            if (this.#selecting) this.#onSelectionChange();
            else if (this.#index >= 0) this.#setEdges(this.#blocks[0], this.#wordEdges(this.#index), true);
        });

        constructor() {
            super();
            this.#overlay.dataset.markerOverlay = '';
            this.#overlay.ariaHidden = 'true';
            this.#overlay.inert = true;
            this.#paint.dataset.markerPaint = '';
            this.#copy.dataset.markerCopy = '';
            this.#overlay.append(this.#paint, this.#copy);
        }

        /** The highlighted word's index among the marker's words, or -1 for none. */
        get word() {
            return this.#index;
        }
        set word(index: number) {
            this.#setWord(index);
        }

        /** How many words the marker holds: whitespace-separated runs of text, outside `<pre>` and `aria-hidden`. */
        get wordCount() {
            return this.#wordRanges().length;
        }

        // Typed listeners, so `seek` arrives as a `MarkerSeekEvent`.
        addEventListener<K extends keyof MarkerEventMap>(
            type: K,
            listener: (this: HTMLElement, event: MarkerEventMap[K]) => unknown,
            options?: boolean | AddEventListenerOptions,
        ): void;
        addEventListener(
            type: string,
            listener: EventListenerOrEventListenerObject,
            options?: boolean | AddEventListenerOptions,
        ): void;
        addEventListener(
            type: string,
            listener: EventListenerOrEventListenerObject,
            options?: boolean | AddEventListenerOptions,
        ) {
            super.addEventListener(type, listener, options);
        }
        removeEventListener<K extends keyof MarkerEventMap>(
            type: K,
            listener: (this: HTMLElement, event: MarkerEventMap[K]) => unknown,
            options?: boolean | EventListenerOptions,
        ): void;
        removeEventListener(
            type: string,
            listener: EventListenerOrEventListenerObject,
            options?: boolean | EventListenerOptions,
        ): void;
        removeEventListener(
            type: string,
            listener: EventListenerOrEventListenerObject,
            options?: boolean | EventListenerOptions,
        ) {
            super.removeEventListener(type, listener, options);
        }

        /** The index of the word at a viewport point, such as a click, or -1. */
        wordAt(x: number, y: number) {
            const caret = document.caretPositionFromPoint?.(x, y);
            if (!caret) return -1;
            return this.#wordRanges().findIndex(
                (word) =>
                    word.startContainer === caret.offsetNode &&
                    word.startOffset <= caret.offset &&
                    caret.offset <= word.endOffset,
            );
        }

        connectedCallback() {
            this.append(this.#overlay);
            // `aria-hidden` decides which text counts as words, so toggling it changes them too.
            this.#mutations.observe(this, {
                subtree: true,
                childList: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['aria-hidden'],
            });
            this.#resize.observe(this);
            document.addEventListener('selectionchange', this.#onSelectionChange);
            // Capture, to read the selection before the press clears it. Pointer events arrive before a
            // touch clears the selection; only mouse events count clicks for double-clicks.
            document.addEventListener('pointerdown', this.#onPointerDown, true);
            document.addEventListener('mousedown', this.#onMouseDown, true);
            this.addEventListener('click', this.#onClick);
            // Capture on the document hears the page scroll and every nested scroller too.
            document.addEventListener('scroll', this.#onScroll, { capture: true, passive: true });
            this.#rootChanges.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['style', 'class'],
            });
        }

        disconnectedCallback() {
            this.#mutations.disconnect();
            this.#resize.disconnect();
            document.removeEventListener('selectionchange', this.#onSelectionChange);
            document.removeEventListener('pointerdown', this.#onPointerDown, true);
            document.removeEventListener('mousedown', this.#onMouseDown, true);
            this.removeEventListener('click', this.#onClick);
            clearTimeout(this.#seekTimer);
            document.removeEventListener('scroll', this.#onScroll, { capture: true });
            this.#rootChanges.disconnect();
            cancelAnimationFrame(this.#frame);
            this.#frame = 0;
            if ('highlights' in CSS) CSS.highlights.delete(`${MARKER_TAG}-word`);
        }

        attributeChangedCallback(_: string, __: string | null, value: string | null) {
            this.#setWord(value === null ? -1 : Number(value));
        }

        #setting(name: Setting) {
            const value = Number(this.getAttribute(name));
            return this.hasAttribute(name) && Number.isFinite(value) ? value : DEFAULTS[name];
        }

        /**
         * The marker's words. They follow the content, not what is visible right now, so an index stays
         * put while a tooltip fades in; text marked `aria-hidden` is never a word.
         */
        #wordRanges() {
            if (this.#words) return this.#words;
            const words: Range[] = [];
            for (const node of this.#textNodes(false)) {
                if (node.parentElement?.closest('pre, [aria-hidden="true"]')) continue;
                for (const match of node.data.matchAll(/\S+/g)) {
                    const range = document.createRange();
                    range.setStart(node, match.index);
                    range.setEnd(node, match.index + match[0].length);
                    words.push(range);
                }
            }
            return (this.#words = words);
        }

        /** The marker's text, outside the overlay; with `onlyVisible`, only what a reader can see right now. */
        *#textNodes(onlyVisible: boolean) {
            const seen = new Map<Element, boolean>();
            const walker = document.createTreeWalker(this, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const text = node as Text;
                const parent = text.parentElement;
                if (!text.data.trim() || !parent || this.#overlay.contains(text)) continue;
                if (parent.closest('script, style, noscript')) continue;
                if (onlyVisible && !seen.has(parent)) seen.set(parent, visible(parent));
                if (!onlyVisible || seen.get(parent)) yield text;
            }
        }

        /** A viewport rect in the marker's own coordinates, grown by `padX` each side and `padY` above and below. */
        #local(rect: DOMRect | Edges, padX = 0, padY = 0): Edges {
            const box = this.getBoundingClientRect();
            const x = box.left + this.clientLeft;
            const y = box.top + this.clientTop;
            const { l, r, t, b } = 'l' in rect ? rect : { l: rect.left, r: rect.right, t: rect.top, b: rect.bottom };
            return { l: l - x - padX, r: r - x + padX, t: t - y - padY, b: b - y + padY };
        }

        /** The word cursor is padded all round, so the word sits inside it. */
        #wordEdges(index: number) {
            const word = this.#wordRanges()[index];
            // A word stays in the index while hidden, so numbering holds; it just gets no highlight.
            if (!word || !visible(word.startContainer.parentElement!)) return null;
            const rect = word.getClientRects()[0];
            if (!rect) return null;
            const pad = this.#setting('padding');
            const edges = this.#local(rect, pad, pad / 2);
            edges.r += overhang(word.startContainer as Text);
            return edges;
        }

        #wordPoint(): Point | undefined {
            const edges = this.#index >= 0 ? this.#wordEdges(this.#index) : null;
            return edges ? { x: (edges.l + edges.r) / 2, y: (edges.t + edges.b) / 2 } : undefined;
        }

        #setWord(index: number) {
            const valid = Number.isInteger(index) && index >= 0 && index < this.#wordRanges().length;
            const next = valid ? index : -1;
            if (next === this.#index) return;
            this.#index = next;
            this.#markQuietWord();
            // No word, no narration to seek in.
            if (next < 0) this.#dropSeek();
            // A click waiting to seek holds the cursor on its word until the seek lands or is dropped.
            if (this.#selecting || this.#seeking >= 0) return;
            if (next < 0) this.#retire(this.#blocks[0], undefined);
            else this.#moveTo(next);
        }

        /** While a selection holds the highlight, the current word gets a quieter underline. */
        #markQuietWord() {
            if (!('highlights' in CSS)) return;
            const word = this.#wordRanges()[this.#index];
            if (this.#selecting && word) CSS.highlights.set(`${MARKER_TAG}-word`, new Highlight(word));
            else CSS.highlights.delete(`${MARKER_TAG}-word`);
        }

        /** Block 0 to a word. Across a line wrap, the old shape shrinks out as the new one grows in. */
        #moveTo(index: number) {
            const to = this.#wordEdges(index);
            if (!to) return this.#retire(this.#blocks[0], undefined);
            const holder = this.#wordRanges()[index].startContainer.parentElement!;
            this.#reveal([holder]);
            const head = this.#blocks[0];
            const from = head.at;
            const previous = head.ref;
            head.ref = this.#refOf(holder);
            if (!from || sameLine(from, to) || reducedMotion()) return this.#setEdges(head, to);
            const forward = to.t > from.t;
            clearTimeout(this.#wrapTimer);
            Object.assign(this.#tail, { at: from, tweens: head.tweens, ref: previous });
            const edge = forward ? from.r : from.l;
            this.#setEdges(this.#tail, { ...from, l: edge, r: edge });
            this.#wrapTimer = setTimeout(() => this.#setEdges(this.#tail, null), this.#setting('trailing'));
            const start = forward ? to.l : to.r;
            this.#setEdges(head, { ...to, l: start, r: start }, true);
            this.#setEdges(head, to);
        }

        /** Sends a block toward `to`: an edge moving outward leads, one moving inward trails. */
        #setEdges(block: Block, to: Edges | null, snap = false, ms?: number) {
            clearTimeout(block.fading);
            block.fading = undefined;
            if (!to) {
                block.at = null;
                block.tweens = null;
                return this.#kick();
            }
            const now = performance.now();
            const current = block.tweens;
            const instant = snap || !current || reducedMotion();
            const [leading, trailing] = [this.#setting('leading'), this.#setting('trailing')];
            const durations: Record<Edge, number> = {
                l: to.l < (block.at?.l ?? to.l) ? leading : trailing,
                r: to.r > (block.at?.r ?? to.r) ? leading : trailing,
                t: trailing,
                b: trailing,
            };
            block.tweens = Object.fromEntries(
                EDGES.map((edge) => [
                    edge,
                    {
                        from: instant || !current ? to[edge] : valueOf(current[edge], now),
                        to: to[edge],
                        start: now,
                        dur: instant ? 0 : (ms ?? durations[edge]),
                    },
                ]),
            ) as Record<Edge, Tween>;
            block.at = to;
            this.#kick();
        }

        /** Shrinks a block out of existence toward a point (see `shrinkTarget`), then hides it. */
        #retire(block: Block, point: Point | undefined, ms = this.#setting('trailing')) {
            if (!block.at || block.fading) return;
            if (reducedMotion()) return this.#setEdges(block, null);
            const x = shrinkTarget(block.at, point);
            this.#setEdges(block, { ...block.at, l: x, r: x }, false, ms);
            block.fading = setTimeout(() => this.#setEdges(block, null), ms);
        }

        #kick() {
            if (!this.#frame) this.#frame = requestAnimationFrame(this.#tick);
        }

        #tick = (now: number) => {
            this.#frame = 0;
            if (this.#copyStale) this.#refreshCopy();
            if (this.#shownStale) this.#markShown();
            const radius = this.#setting('radius');
            const paths: string[] = [];
            let moving = false;
            for (const { tweens } of [...this.#blocks, this.#tail]) {
                if (!tweens) continue;
                const [l, r, t, b] = EDGES.map((edge) => valueOf(tweens[edge], now));
                moving ||= EDGES.some((edge) => now < tweens[edge].start + tweens[edge].dur);
                if (r - l > 0.5) paths.push(shapePath({ l, r, t, b }, radius));
            }
            const clip = `path('${paths.join(' ') || 'M0 0Z'}')`;
            this.#paint.style.clipPath = clip;
            this.#copy.style.clipPath = clip;
            if (moving) this.#kick();
            // Once nothing is highlighted, the next highlight starts from an empty copy.
            else if (!paths.length && this.#shown.size) this.#reveal(null);
            // Once the cursor settles, only its word's element stays shown; elements it passed over during
            // the move drop out, so later edits to them leave the copy alone.
            else if (
                !this.#selecting &&
                this.#cursorWord() >= 0 &&
                this.#shown.size > 1 &&
                // Only once the cursor is all that shows: lines of a wipe still waiting their turn need their text.
                !this.#tail.at &&
                this.#blocks.every((block, i) => i === 0 || !block.at)
            ) {
                const holder = this.#wordRanges()[this.#cursorWord()]?.startContainer.parentElement;
                if (holder) {
                    this.#shown = new Set([holder]);
                    this.#markShown();
                }
            }
        };

        /** Copies the marker's content into the overlay, inset by the marker's padding like the original. */
        #refreshCopy() {
            this.#copyStale = false;
            this.#shownStale = true;
            const style = getComputedStyle(this);
            this.#copy.style.padding = style.padding;
            // Copied into a document with no custom elements defined, so nothing in the copy upgrades and
            // runs its own code a second time. A plain box of the same display stands in for each one.
            const originals = [...this.querySelectorAll('*')].filter(
                (el) => el.localName.includes('-') && !this.#overlay.contains(el),
            );
            const inert = document.implementation.createHTMLDocument('');
            const holder = inert.createElement('div');
            holder.append(...this.#content().map((node) => inert.importNode(node, true)));
            [...holder.querySelectorAll('*')]
                .filter((el) => el.localName.includes('-'))
                .forEach((el, i) => {
                    const plain = inert.createElement('div');
                    for (const { name, value } of el.attributes) plain.setAttribute(name, value);
                    // Styles that select the custom element's tag won't match its stand-in, so the
                    // stand-in takes the original's box as computed: the space it holds stays the same.
                    if (originals[i]) {
                        const box = getComputedStyle(originals[i]);
                        // Layout size, not the painted one: a transform doesn't change the space it holds.
                        const { offsetWidth: width, offsetHeight: height } = originals[i] as HTMLElement;
                        Object.assign(plain.style, {
                            display: box.display,
                            boxSizing: 'border-box',
                            width: `${width}px`,
                            height: `${height}px`,
                            margin: box.margin,
                            padding: box.padding,
                        });
                    }
                    plain.append(...el.childNodes);
                    el.replaceWith(plain);
                });
            for (const el of holder.querySelectorAll('[id]')) el.removeAttribute('id');
            this.#copy.replaceChildren(...holder.childNodes);
            // A scrolled box starts at the top in a fresh copy; put it where the original is.
            for (const el of this.querySelectorAll('*'))
                if ((el.scrollLeft || el.scrollTop) && !this.#overlay.contains(el)) this.#syncScroll(el);
        }

        #syncScroll(el: Element) {
            this.#copyOf(el)?.scrollTo(el.scrollLeft, el.scrollTop);
        }

        #content() {
            return [...this.childNodes].filter((node) => node !== this.#overlay);
        }

        /**
         * Elements whose copy shows. The rest of the copy stays hidden: with its backgrounds gone, text a
         * fixed header normally covers would otherwise show through the highlight.
         */
        #shown = new Set<Element>();
        #shownStale = false;
        /** Shows the copies of these elements too, or with `null`, hides the whole copy again. */
        #reveal(elements: Iterable<Element> | null) {
            if (!elements) this.#shown.clear();
            else for (const el of elements) this.#shown.add(el);
            this.#shownStale = true;
            this.#kick();
        }

        #markShown() {
            this.#shownStale = false;
            for (const el of this.#copy.querySelectorAll('[data-marker-show]')) el.removeAttribute('data-marker-show');
            for (const el of this.#shown) this.#copyOf(el)?.setAttribute('data-marker-show', '');
        }

        /** The copy of an element inside the marker, found by its position among its siblings. */
        #copyOf(el: Element) {
            // A page navigation can replace what the highlight was on before its copy catches up.
            if (!this.contains(el) || this.#overlay.contains(el)) return null;
            const path: number[] = [];
            for (let node: Node = el; node !== this; node = node.parentNode!) {
                const siblings = node.parentNode === this ? this.#content() : [...node.parentNode!.childNodes];
                path.unshift(siblings.indexOf(node as ChildNode));
            }
            let at: Node | undefined = this.#copy;
            for (const index of path) at = at?.childNodes[index];
            return at instanceof Element ? at : null;
        }

        /** The kind of pointer behind the latest press: `mouse`, `touch` or `pen`. */
        #pointer = 'mouse';
        /** Whether text was selected when the press began; by click time the press has cleared it. */
        #hadSelection = false;
        /** When the latest first click began; the double-click window runs from here. */
        #firstPress = 0;
        /** The word a click is waiting to seek to, or -1. */
        #seeking = -1;
        #seekTimer: ReturnType<typeof setTimeout> | undefined;

        #onPointerDown = (event: PointerEvent) => {
            this.#pointer = event.pointerType;
            this.#hadSelection = !getSelection()?.isCollapsed;
            const local = this.#local({ l: event.clientX, r: event.clientX, t: event.clientY, b: event.clientY });
            this.#deselectAt = this.#selecting ? { x: local.l, y: local.t } : undefined;
        };

        /** Mouse events count clicks: the second press of a double-click drops a waiting seek. */
        #onMouseDown = (event: MouseEvent) => {
            if (event.detail < 2) this.#firstPress = performance.now();
            else if (this.#seeking >= 0) this.#dropSeek();
        };

        /**
         * Click or tap a word to seek there, while a word is highlighted. A tap seeks at once: touch
         * selects by long press, so no double-tap can follow. A click moves the cursor at once and seeks
         * when the double-click window closes, unless a second click makes it a double-click.
         */
        #onClick = (event: MouseEvent) => {
            if (this.#index < 0 || event.detail !== 1 || event.button !== 0) return;
            if (
                (event.target as Element).closest(
                    'a, button, input, textarea, select, label, summary, [contenteditable]',
                )
            )
                return;
            // A click that clears a selection only deselects; one that ends a drag only selects.
            if (this.#hadSelection || !getSelection()?.isCollapsed) return;
            const word = this.wordAt(event.clientX, event.clientY);
            if (word < 0) return;
            if (this.#pointer !== 'mouse') return this.#seek(word);
            this.#seeking = word;
            this.#moveTo(word);
            clearTimeout(this.#seekTimer);
            const wait = this.#firstPress + this.#setting('double-click') - performance.now();
            this.#seekTimer = setTimeout(() => this.#seek(word), Math.max(0, wait));
        };

        /** Lands a seek: the cursor stays on the word, and `seek` tells the narration where to go. */
        #seek(word: number) {
            clearTimeout(this.#seekTimer);
            this.#seeking = -1;
            this.#index = word;
            this.#moveTo(word);
            this.dispatchEvent(new CustomEvent('seek', { detail: { word } }) satisfies MarkerSeekEvent);
        }

        /** Drops a waiting seek; the browser selects the double-clicked word instead. */
        #dropSeek() {
            clearTimeout(this.#seekTimer);
            this.#seeking = -1;
        }

        #onScroll = (event: Event) => {
            // With nothing showing, only note that the copy is out of date; the next highlight rebuilds it.
            if (!this.#showing()) {
                this.#copyStale = true;
                return;
            }
            // A scrolled box inside the marker: scroll its copy along.
            if (event.target instanceof Element && this.contains(event.target)) this.#syncScroll(event.target);
            // Content that restyles itself on page scroll, such as a sticky header, would leave the copy behind.
            else this.#copyStale = true;
            this.#followLayout();
        };
        /** A page can move text from styles on `<html>`, like a parallax hero; the copy follows those itself. */
        // A cursor on a hidden word shows nothing, yet a root change may bring the word back.
        #rootChanges = new MutationObserver(() => (this.#showing() || this.#index >= 0) && this.#followLayout());

        #showing() {
            return [...this.#blocks, this.#tail].some((block) => block.at);
        }

        /**
         * Keeps a showing highlight on text that moved without the selection changing. A selection
         * re-measures as usual (see `#followSelection`); the word cursor moves with its word and takes its
         * new size.
         */
        #followLayout() {
            if (this.#selecting) return this.#onSelectionChange();
            this.#followRefs();
            if (this.#index >= 0 && this.#seeking < 0) this.#placeCursor();
            this.#kick();
        }

        /** The word the cursor shows: a clicked word while its seek waits, otherwise the narration's word. */
        #cursorWord() {
            return this.#seeking >= 0 ? this.#seeking : this.#index;
        }

        /** The word cursor onto its word as it is now: moved and resized, shown again, or shrunk away. */
        #placeCursor() {
            const head = this.#blocks[0];
            const to = this.#wordEdges(this.#index);
            if (!to) return this.#retire(head, undefined);
            if (!head.at || !head.tweens || head.fading) return this.#moveTo(this.#index);
            // The word's element may have been replaced: show the copy of the one it is in now.
            const holder = this.#wordRanges()[this.#index].startContainer.parentElement!;
            if (!this.#shown.has(holder)) {
                this.#reveal([holder]);
                head.ref = this.#refOf(holder);
            }
            const at = head.at;
            if (EDGES.every((edge) => Math.abs(at[edge] - to[edge]) < 0.5)) return;
            for (const edge of EDGES) head.tweens[edge].to = to[edge];
            head.at = to;
            this.#kick();
        }

        /** Where an element sits, to tell later how far it moved. */
        #refOf(el: Element) {
            const { l, t } = this.#local(el.getBoundingClientRect());
            return { el, x: l, y: t };
        }

        /**
         * Moves each block as far as the element holding its text moved, animations and all: every edge
         * of every tween shifts by the same amount, so a block mid-move keeps moving, just from where its
         * text went. Blocks over a fixed header, a scrolled box or a parallax layer each move their own way.
         */
        #followRefs() {
            for (const block of [...this.#blocks, this.#tail]) {
                const ref = block.ref;
                if (!ref?.el.isConnected || !block.at) continue;
                const now = this.#refOf(ref.el);
                const [dx, dy] = [now.x - ref.x, now.y - ref.y];
                block.ref = now;
                if (!dx && !dy) continue;
                const by: Record<Edge, number> = { l: dx, r: dx, t: dy, b: dy };
                for (const edge of EDGES) {
                    block.at[edge] += by[edge];
                    if (!block.tweens) continue;
                    block.tweens[edge].from += by[edge];
                    block.tweens[edge].to += by[edge];
                }
            }
            this.#kick();
        }

        #onSelectionChange = () => {
            cancelAnimationFrame(this.#selectionFrame);
            this.#selectionFrame = requestAnimationFrame(() => this.#followSelection());
        };

        #followSelection() {
            const selection = getSelection();
            const range = selection?.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0) : undefined;
            const inField = (node: Node | null) =>
                !!(node instanceof Element ? node : node?.parentElement)?.closest('input, textarea');
            const mine = range && range.intersectsNode(this) && !inField(selection!.anchorNode);
            if (!mine) return this.#selecting && this.#clearSelection(selection);

            if (!this.#selecting) {
                this.#selecting = true;
                this.#markQuietWord();
            }
            // Carry the blocks along with any text that moved under them first, then animate whatever
            // the selection itself changed.
            this.#followRefs();
            clearTimeout(this.#wrapTimer);
            this.#setEdges(this.#tail, null);
            const lines = this.#selectedLines(range);
            // A block stays on the line it already covers, so extending up or down never shifts the others.
            const placed = new Map<(typeof lines)[number], Block>();
            const taken = () => [...placed.values()];
            for (const to of lines) {
                const same = this.#blocks.find((b) => b.at && !taken().includes(b) && sameLine(b.at, to));
                if (same) placed.set(to, same);
            }
            for (const to of lines) {
                if (placed.has(to)) continue;
                // The word cursor travels to the first new line; other new lines grow in place.
                const head = this.#blocks[0];
                if (head.at && !taken().includes(head)) {
                    placed.set(to, head);
                    continue;
                }
                const fresh = this.#blocks.find((b) => !b.at && !taken().includes(b)) ?? newBlock();
                if (!this.#blocks.includes(fresh)) this.#blocks.push(fresh);
                // A new line grows out of the side joined to the rest of the selection.
                const above = taken().some((b) => b.at!.t > to.t);
                this.#setEdges(fresh, above ? { ...to, l: to.r } : { ...to, r: to.l }, true);
                placed.set(to, fresh);
            }
            for (const [to, block] of placed) {
                this.#setEdges(block, to);
                block.ref = this.#refOf(to.holder);
            }
            // A line that left the selection shrinks into the side joined to what remains.
            for (const block of this.#blocks) {
                if (taken().includes(block) || !block.at) continue;
                const top = block.at.t;
                const towards = lines.some((to) => to.t < top)
                    ? { x: 0, y: -Infinity }
                    : lines.some((to) => to.t > top)
                      ? { x: 0, y: Infinity }
                      : undefined;
                this.#retire(block, towards);
            }
        }

        /**
         * One edge set per line of selected text, as wide as that line's text. Gaps fill in levels:
         * between the lines of an element the selection covers whole, then between elements once a
         * whole heading section is selected.
         */
        #selectedLines(range: Range): (Edges & { holder: Element })[] {
            const items: { rect: Edges; item: Text }[] = [];
            for (const node of this.#textNodes(true)) {
                if (!range.intersectsNode(node)) continue;
                const part = document.createRange();
                part.setStart(node, node === range.startContainer ? range.startOffset : 0);
                part.setEnd(node, node === range.endContainer ? range.endOffset : node.length);
                // Italic glyphs lean past their box, so a run ending in italics reaches a little further.
                const lean = overhang(node);
                for (const rect of part.getClientRects())
                    if (rect.width >= 1)
                        items.push({
                            rect: { l: rect.left, r: rect.right + lean, t: rect.top, b: rect.bottom },
                            item: node,
                        });
            }
            this.#reveal(items.map(({ item }) => item.parentElement!));
            const lines = mergeLines(items);
            const whole = this.#wholeSections(range);
            const unit = (node: Text) => node.parentElement?.closest(UNIT) ?? null;
            const inWhole = (node: Text) => {
                for (let el = node.parentElement; el && el !== this; el = el.parentElement)
                    if (whole.has(el)) return true;
                return false;
            };
            // No horizontal padding: a line ends exactly where its selected text does, trailing space or not.
            const padY = this.#setting('padding') / 2;
            const edges = lines.map((line) => ({ ...this.#local(line, 0, padY), holder: line.item.parentElement! }));
            for (let i = 0; i < edges.length - 1; i++) {
                const [here, next] = [lines[i].item, lines[i + 1].item];
                const sameUnit = unit(here) && unit(here) === unit(next) && covers(range, unit(here)!);
                if (sameUnit || (inWhole(here) && inWhole(next))) edges[i].b = Math.max(edges[i].b, edges[i + 1].t);
            }
            return edges;
        }

        /** Elements in a heading section the selection covers whole: a heading up to the next of its rank or higher. */
        #wholeSections(range: Range) {
            const whole = new Set<Element>();
            for (const heading of this.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
                if (this.#overlay.contains(heading)) continue;
                const level = headingLevel(heading);
                const members = [heading];
                for (let el = heading.nextElementSibling; el; el = el.nextElementSibling) {
                    const next = headingLevel(el);
                    if (next && next <= level) break;
                    members.push(el);
                }
                if (members.every((member) => covers(range, member))) members.forEach((m) => whole.add(m));
            }
            return whole;
        }

        /**
         * Clears the selection highlight with a wipe toward one point, farthest line first, all within
         * `stagger` ms. The point is the word cursor when one remains, else the press that cleared the
         * selection, else the caret a drag left behind.
         */
        #clearSelection(selection: Selection | null) {
            this.#selecting = false;
            this.#markQuietWord();
            const keepHead = this.#index >= 0;
            const leaving = this.#blocks.filter((b, i) => b.at && (i > 0 || !keepHead));
            const point = this.#wordPoint() ?? this.#deselectAt ?? this.#caretPoint(selection);
            this.#deselectAt = undefined;
            const leading = this.#setting('leading');
            if (!point || reducedMotion()) for (const block of leaving) this.#retire(block, point, leading);
            else {
                const ordered = wipeOrder(
                    leaving.map((block) => ({ ...block.at!, block })),
                    point,
                );
                const step = ordered.length > 1 ? this.#setting('stagger') / (ordered.length - 1) : 0;
                ordered.forEach(({ block }, i) => {
                    if (i === 0) return this.#retire(block, point, leading);
                    clearTimeout(block.fading);
                    block.fading = setTimeout(() => {
                        block.fading = undefined;
                        this.#retire(block, point, leading);
                    }, i * step);
                });
            }
            if (keepHead) this.#moveTo(this.#index);
        }

        #caretPoint(selection: Selection | null): Point | undefined {
            if (!selection?.rangeCount) return undefined;
            const rect = selection.getRangeAt(0).getClientRects()[0];
            if (!rect) return undefined;
            const local = this.#local(rect);
            return { x: local.l, y: (local.t + local.b) / 2 };
        }
    };
}

/** `<mia-marker>`'s element type, for `querySelector<MarkerElement>`. */
export type MarkerElement = InstanceType<ReturnType<typeof createMarker>>;

/** Fired when the reader clicks or taps a word to seek to it. */
export type MarkerSeekEvent = CustomEvent<{ word: number }>;
export interface MarkerEventMap extends HTMLElementEventMap {
    seek: MarkerSeekEvent;
}

declare global {
    interface HTMLElementTagNameMap {
        'mia-marker': MarkerElement;
    }
}

/**
 * Whether a range covers all of an element's text. Browsers move a selection's ends into the nearest
 * text, so comparing against the element's own boundaries would never match.
 */
function covers(range: Range, el: Element) {
    const texts: Text[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode())
        if ((node as Text).data.trim()) texts.push(node as Text);
    if (!texts.length) return range.intersectsNode(el);
    const own = document.createRange();
    const [first, last] = [texts[0], texts.at(-1)!];
    own.setStart(first, first.data.search(/\S/));
    own.setEnd(last, last.data.trimEnd().length);
    return (
        range.compareBoundaryPoints(Range.START_TO_START, own) <= 0 &&
        range.compareBoundaryPoints(Range.END_TO_END, own) >= 0
    );
}
