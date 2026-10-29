/**
 * A feathered map of where the page shows text and images, small enough to redraw every frame.
 * The field multiplies its light by one minus the mask's alpha, so it still moves over the copy
 * but never peaks behind it.
 */

/** How the darkening is shaped. The site uses the defaults; a printed CV tunes its own. */
export interface CalmOptions {
    /** CSS pixels past each line box or image at which the darkening is at half strength. */
    radius: number;
    /** Gaussian blur over that edge, in CSS pixels. */
    feather: number;
    /** Share of the field's light taken away at the core. */
    strength: number;
}
export const CALM_DEFAULTS: CalmOptions = { radius: 110, feather: 128, strength: 0.2 };
/** CSS pixels per mask texel. The mask is all soft edges, so a coarse grid loses nothing. */
const TEXEL = 8;
/** Elements whose content never calms the field: opted out by the page, or not drawn at all. */
const SKIP = '[data-atmosphere-calm="off"], canvas, script, style, template, noscript';
const MEDIA = 'img, video, svg';
/** Image silhouettes grow by the radius by stamping them around rings at a third, two thirds and all of it. */
const DILATION = [
    [0, 0],
    ...[1, 2, 3].flatMap((ring) =>
        Array.from({ length: 12 }, (_, i) => [
            (ring / 3) * Math.cos(i * (Math.PI / 6)),
            (ring / 3) * Math.sin(i * (Math.PI / 6)),
        ]),
    ),
];

/** An image drawn by its own alpha rather than its box, cut to what its clipping ancestors show. */
interface Cutout {
    image: HTMLImageElement;
    box: [x: number, y: number, width: number, height: number];
    clip: [left: number, top: number, right: number, bottom: number];
}

/** Images whose pixels may be read: a cross-origin one would taint the mask and stop its upload. */
const readable = (image: HTMLImageElement) => {
    if (!image.complete || !image.naturalWidth) return false;
    const url = new URL(image.currentSrc || image.src, location.href);
    return url.origin === location.origin || url.protocol === 'data:' || url.protocol === 'blob:';
};

/** The viewport area an element's overflow-clipping ancestors leave visible, axis by axis. */
function visibleArea(element: Element): Cutout['clip'] {
    const clip: Cutout['clip'] = [-Infinity, -Infinity, Infinity, Infinity];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const { overflowX, overflowY } = getComputedStyle(parent);
        if (overflowX === 'visible' && overflowY === 'visible') continue;
        const rect = parent.getBoundingClientRect();
        if (overflowX !== 'visible') {
            clip[0] = Math.max(clip[0], rect.left);
            clip[2] = Math.min(clip[2], rect.right);
        }
        if (overflowY !== 'visible') {
            clip[1] = Math.max(clip[1], rect.top);
            clip[3] = Math.min(clip[3], rect.bottom);
        }
    }
    return clip;
}

const canvas2d = (canvas: HTMLCanvasElement) => canvas.getContext('2d')!;

/** Measured shapes around some origin: boxes flattened as x, y, width, height, and image cutouts. */
interface Layer {
    boxes: number[];
    cutouts: Cutout[];
}
type Source = Text | Element;
/** What content moves with: the page as it scrolls, the view (fixed), or either in turn (sticky). */
type Anchor = 'page' | 'view' | 'sticky';

/** Shifts a layer into view coordinates, keeping what lies within reach of the view. */
function place(layer: Layer, dx: number, dy: number, viewport: DOMRect, reach: number, out: Layer) {
    const near = (x: number, y: number, width: number, height: number) =>
        x + width > -reach && y + height > -reach && x < viewport.width + reach && y < viewport.height + reach;
    const { boxes } = layer;
    for (let i = 0; i < boxes.length; i += 4) {
        const x = boxes[i] + dx,
            y = boxes[i + 1] + dy;
        if (near(x, y, boxes[i + 2], boxes[i + 3]))
            out.boxes.push(Math.round(x), Math.round(y), Math.round(boxes[i + 2]), Math.round(boxes[i + 3]));
    }
    // Unclipped sides end just past the view, so the clip stays finite for the canvas.
    const within = (value: number, size: number) => Math.round(Math.min(Math.max(value, -reach), size + reach));
    for (const { image, box, clip } of layer.cutouts) {
        const [x, y, width, height] = [box[0] + dx, box[1] + dy, box[2], box[3]];
        if (!near(x, y, width, height)) continue;
        out.cutouts.push({
            image,
            box: [Math.round(x), Math.round(y), Math.round(width), Math.round(height)],
            clip: [
                within(clip[0] + dx, viewport.width),
                within(clip[1] + dy, viewport.height),
                within(clip[2] + dx, viewport.width),
                within(clip[3] + dy, viewport.height),
            ],
        });
    }
}

/** Attributes that can move, show or hide content. */
const LAYOUT_ATTRIBUTES = ['class', 'style', 'hidden', 'open', 'src', 'srcset'];
/** A running animation on the document clock can move content without any other signal. */
const moving = () =>
    document
        .getAnimations()
        .some((animation) => animation.timeline === document.timeline && animation.playState === 'running');

/**
 * Builds the mask every frame without reading layout every frame. Content that scrolls with the
 * page is measured once in page coordinates and shifted by the scroll offset; it is measured again
 * only when the page changes: DOM edits, the page or view resizing, fonts or images loading, nested scrolling, or a
 * running animation. Fixed content is cached the same way in view coordinates; only sticky content,
 * which moves against both, is measured every frame.
 */
export class CalmMask {
    private readonly context: CanvasRenderingContext2D;
    /** Where image silhouettes are dilated before joining the mask, so the blur treats them as one. */
    private readonly scratch = document.createElement('canvas');
    private readonly silhouettes = new WeakMap<HTMLImageElement, { key: string; canvas: HTMLCanvasElement }>();
    private readonly range = document.createRange();
    private readonly mutations: MutationObserver;
    private readonly resizes: ResizeObserver;
    private sources: Record<Anchor, Source[]> = { page: [], view: [], sticky: [] };
    private stale = true;
    /** Content measured in page and in view coordinates, until something invalidates it. */
    private page?: Layer;
    private view?: Layer;
    private signature = '';
    /** The view's last size: resizing it moves fixed and viewport-sized content without resizing the page. */
    private viewportSize = '';
    /** The mask itself, for the renderer to upload. It is never attached to the page. */
    readonly canvas = document.createElement('canvas');

    constructor(
        private readonly root: Element = document.body,
        private readonly options: CalmOptions = CALM_DEFAULTS,
    ) {
        this.context = canvas2d(this.canvas);
        // The mask's own canvases, the debug panel and anything opted out never affect it.
        const relevant = ({ target }: MutationRecord) =>
            !(target instanceof Element ? target : target.parentElement)?.closest(SKIP);
        this.mutations = new MutationObserver((records) => {
            if (records.some(relevant)) this.stale = true;
        });
        this.mutations.observe(root, {
            childList: true,
            subtree: true,
            characterData: true,
            attributeFilter: LAYOUT_ATTRIBUTES,
        });
        this.resizes = new ResizeObserver(this.invalidate);
        this.resizes.observe(root);
        document.fonts.addEventListener('loadingdone', this.invalidate);
        root.addEventListener('load', this.invalidate, true);
        document.addEventListener('scroll', this.nestedScroll, { capture: true, passive: true });
    }

    /** Redraws the mask for the current layout. Returns whether it changed and needs uploading. */
    update(viewport: DOMRect): boolean {
        const width = Math.max(1, Math.ceil(viewport.width / TEXEL)),
            height = Math.max(1, Math.ceil(viewport.height / TEXEL));
        // A Gaussian is spent by three standard deviations.
        const reach = this.options.radius + this.options.feather * 3;
        const shapes: Layer = { boxes: [], cutouts: [] };
        if (this.stale) this.collect();
        const size = `${viewport.width}x${viewport.height}`;
        if (size !== this.viewportSize) {
            this.viewportSize = size;
            this.invalidate();
        }
        if (!this.page || !this.view || moving()) {
            this.page = this.measure(this.sources.page, scrollX, scrollY);
            this.view = this.measure(this.sources.view, 0, 0);
        }
        place(this.page, -scrollX - viewport.left, -scrollY - viewport.top, viewport, reach, shapes);
        place(this.view, -viewport.left, -viewport.top, viewport, reach, shapes);
        place(this.measure(this.sources.sticky, 0, 0), -viewport.left, -viewport.top, viewport, reach, shapes);
        const images = shapes.cutouts.map(({ image, box, clip }) => `${image.currentSrc}:${box}:${clip}`);
        const signature = `${width}x${height}:${shapes.boxes}:${images}`;
        if (signature === this.signature) return false;
        this.signature = signature;
        this.draw(shapes.boxes, shapes.cutouts, width, height);
        return true;
    }

    destroy() {
        this.mutations.disconnect();
        this.resizes.disconnect();
        document.fonts.removeEventListener('loadingdone', this.invalidate);
        this.root.removeEventListener('load', this.invalidate, true);
        document.removeEventListener('scroll', this.nestedScroll, { capture: true });
    }

    private readonly invalidate = () => {
        this.page = undefined;
        this.view = undefined;
    };
    /** The page's own scrolling is the shift; a scrolling element inside it moves its content. */
    private readonly nestedScroll = (event: Event) => {
        if (event.target !== document) this.invalidate();
    };

    /** Shapes of the given sources, positioned at their viewport position plus the origin. */
    private measure(sources: Source[], originX: number, originY: number): Layer {
        const layer: Layer = { boxes: [], cutouts: [] };
        for (const source of sources) {
            const element = source instanceof Text ? source.parentElement! : source;
            // Optional: Safari only has it from 17.4.
            if (element.checkVisibility?.({ visibilityProperty: true }) === false) continue;
            if (element instanceof HTMLImageElement && readable(element)) {
                const rect = element.getBoundingClientRect();
                const [left, top, right, bottom] = visibleArea(element);
                layer.cutouts.push({
                    image: element,
                    box: [rect.left + originX, rect.top + originY, rect.width, rect.height],
                    clip: [left + originX, top + originY, right + originX, bottom + originY],
                });
                continue;
            }
            let rects: Iterable<DOMRect>;
            if (source instanceof Text) {
                // Screen-reader-only text lays out as full lines inside a 1px clip.
                const parent = element.getBoundingClientRect();
                if (parent.width <= 1 && parent.height <= 1) continue;
                this.range.selectNodeContents(source);
                rects = this.range.getClientRects();
            } else rects = [source.getBoundingClientRect()];
            for (const rect of rects)
                if (rect.width > 0 && rect.height > 0)
                    layer.boxes.push(rect.left + originX, rect.top + originY, rect.width, rect.height);
        }
        return layer;
    }

    /** Finds text nodes with something to show, and media elements, grouped by what they move with. */
    private collect() {
        this.stale = false;
        this.invalidate();
        this.sources = { page: [], view: [], sticky: [] };
        // The nearest fixed or sticky ancestor decides; everything else scrolls with the page.
        const anchors = new Map<Element, Anchor>();
        const anchor = (element: Element | null): Anchor => {
            if (!element) return 'page';
            let value = anchors.get(element);
            if (value === undefined) {
                const { position } = getComputedStyle(element);
                value =
                    position === 'fixed' ? 'view' : position === 'sticky' ? 'sticky' : anchor(element.parentElement);
                anchors.set(element, value);
            }
            return value;
        };
        const add = (source: Source) =>
            this.sources[anchor(source instanceof Text ? source.parentElement : source)].push(source);
        const walker = document.createTreeWalker(this.root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (node instanceof Text) return node.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
                const element = node as Element;
                if (element.matches(SKIP)) return NodeFilter.FILTER_REJECT;
                // A media element is one box; nothing inside it needs measuring.
                if (element.matches(MEDIA)) {
                    add(element);
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_SKIP;
            },
        });
        while (walker.nextNode()) add(walker.currentNode as Text);
    }

    /** An image's alpha as solid white at mask scale, cached until its source or size changes. */
    private silhouette(image: HTMLImageElement, width: number, height: number) {
        const key = `${image.currentSrc}@${width}x${height}`;
        const cached = this.silhouettes.get(image);
        if (cached?.key === key) return cached.canvas;
        const canvas = cached?.canvas ?? document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas2d(canvas);
        context.drawImage(image, 0, 0, width, height);
        context.globalCompositeOperation = 'source-in';
        context.fillStyle = '#fff';
        context.fillRect(0, 0, width, height);
        this.silhouettes.set(image, { key, canvas });
        return canvas;
    }

    private draw(boxes: number[], cutouts: Cutout[], width: number, height: number) {
        const { canvas, context, scratch } = this;
        for (const target of cutouts.length ? [canvas, scratch] : [canvas])
            if (target.width !== width || target.height !== height) {
                target.width = width;
                target.height = height;
            } else canvas2d(target).clearRect(0, 0, width, height);
        // Expand every box by the radius with round corners, then blur the union: the feather. Safari
        // ships canvas filters switched off, so the blur is a shadow, which every engine draws: the
        // shapes are drawn off the canvas to the left and only their blurred shadow is offset back.
        // A shadow blur is twice the Gaussian's standard deviation.
        const { feather, strength } = this.options;
        const radius = this.options.radius / TEXEL;
        // Boxes are cut off past this margin, where the feather can no longer reach the view, so the
        // shift below always clears them: nothing but the shadow lands on the canvas.
        const margin = radius + (feather * 3) / TEXEL;
        const shift = width + margin * 2;
        context.save();
        context.translate(-shift, 0);
        context.shadowOffsetX = shift;
        context.shadowBlur = (feather / TEXEL) * 2;
        context.shadowColor = '#fff';
        context.fillStyle = '#fff';
        context.beginPath();
        for (let i = 0; i < boxes.length; i += 4) {
            const left = Math.max(boxes[i] / TEXEL - radius, -margin),
                right = Math.min((boxes[i] + boxes[i + 2]) / TEXEL + radius, width + margin);
            context.roundRect(
                left,
                boxes[i + 1] / TEXEL - radius,
                right - left,
                boxes[i + 3] / TEXEL + radius * 2,
                radius,
            );
        }
        context.fill();
        // Images grow by the radius around their own outline, within what their clip shows, and blur the same way.
        if (cutouts.length) {
            const stamp = canvas2d(scratch);
            for (const { image, box, clip } of cutouts) {
                const [x, y, w, h] = box.map((value) => value / TEXEL);
                const shape = this.silhouette(image, Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
                const [left, top, right, bottom] = clip.map((value) => value / TEXEL);
                stamp.save();
                stamp.beginPath();
                stamp.rect(left - radius, top - radius, right - left + radius * 2, bottom - top + radius * 2);
                stamp.clip();
                for (const [dx, dy] of DILATION) stamp.drawImage(shape, x + dx * radius, y + dy * radius, w, h);
                stamp.restore();
            }
            context.drawImage(scratch, 0, 0);
        }
        context.restore();
        // Scale the union to the strength: keeping the destination by a translucent fill multiplies its alpha.
        context.save();
        context.globalCompositeOperation = 'destination-in';
        context.fillStyle = `rgb(0 0 0 / ${strength})`;
        context.fillRect(0, 0, width, height);
        context.restore();
    }
}
