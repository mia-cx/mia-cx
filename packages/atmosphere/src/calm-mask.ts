import { persistentAtom } from '@nanostores/persistent';

/**
 * A feathered map of where the page shows text and images, small enough to redraw every frame.
 * The field multiplies its light by one minus the mask's alpha, so it still moves over the copy
 * but never peaks behind it. The same canvas, scaled up, is the debug overlay.
 */
export interface CalmSettings {
    /** CSS pixels past each line box or image at which the darkening is at half strength. */
    radius: number;
    /** Gaussian blur over that edge, in CSS pixels. */
    feather: number;
    /** Falloff curve: above 1 pulls the darkening in toward the copy, below 1 spreads it out. */
    exponent: number;
    /** Share of the field's light taken away at the core. */
    strength: number;
}

export const CALM_DEFAULTS: CalmSettings = { radius: 16, feather: 24, exponent: 1, strength: 0.5 };

/** The live settings, kept in this browser once tuned from the debug panel. */
export const calmSettings = persistentAtom<CalmSettings>('atmosphere:calm:v1', CALM_DEFAULTS, {
    encode: JSON.stringify,
    decode: (value) => ({ ...CALM_DEFAULTS, ...JSON.parse(value) }),
});
/** Debug switch for the field's own centre ellipse, to judge the calm mask on its own. */
export const centreEllipse = persistentAtom<boolean>('atmosphere:centre-ellipse:v1', true, {
    encode: JSON.stringify,
    decode: JSON.parse,
});

export const CALM_CONTROLS = [
    { key: 'radius', label: 'Radius', min: 0, max: 128, step: 1 },
    { key: 'feather', label: 'Feather', min: 0, max: 128, step: 1 },
    { key: 'exponent', label: 'Exponent', min: 0.1, max: 6, step: 0.05 },
    { key: 'strength', label: 'Strength', min: 0, max: 1, step: 0.01 },
] as const satisfies readonly { key: keyof CalmSettings; label: string; min: number; max: number; step: number }[];

/** CSS pixels per mask texel. The mask is all soft edges, so a coarse grid loses nothing. */
const TEXEL = 8;
/** Elements whose content never calms the field: opted out by the page, or not drawn at all. */
const SKIP = '[data-atmosphere-calm="off"], canvas, script, style, template, noscript';
const MEDIA = 'img, video, svg';
/** Debug overlay colour. Only the alpha reaches the field. */
const TINT = [0, 255, 170] as const;
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

const canvas2d = (canvas: HTMLCanvasElement) => canvas.getContext('2d', { willReadFrequently: true })!;

export class CalmMask {
    private readonly context: CanvasRenderingContext2D;
    /** Where image silhouettes are dilated before joining the mask, so the blur treats them as one. */
    private readonly scratch = document.createElement('canvas');
    private readonly silhouettes = new WeakMap<HTMLImageElement, { key: string; canvas: HTMLCanvasElement }>();
    private readonly range = document.createRange();
    private readonly observer: MutationObserver;
    private sources?: (Text | Element)[];
    private signature = '';

    constructor(
        readonly canvas: HTMLCanvasElement,
        private readonly root: Element = document.body,
    ) {
        this.context = canvas2d(canvas);
        // Text and images come and go with route changes; positions are re-read every frame anyway.
        this.observer = new MutationObserver(() => (this.sources = undefined));
        this.observer.observe(root, { childList: true, subtree: true, characterData: true });
    }

    /** Redraws the mask for the current layout. Returns whether it changed and needs uploading. */
    update(viewport: DOMRect, settings: CalmSettings): boolean {
        const width = Math.max(1, Math.ceil(viewport.width / TEXEL)),
            height = Math.max(1, Math.ceil(viewport.height / TEXEL));
        const reach = settings.radius + settings.feather * 3;
        const { boxes, cutouts } = this.measure(viewport, reach);
        const shapes = cutouts.map(({ image, box, clip }) => `${image.currentSrc}:${box}:${clip}`);
        const signature = `${width}x${height}:${Object.values(settings)}:${boxes}:${shapes}`;
        if (signature === this.signature) return false;
        this.signature = signature;
        this.draw(boxes, cutouts, width, height, settings);
        return true;
    }

    destroy() {
        this.observer.disconnect();
    }

    /**
     * Everything within reach of the view, relative to it: boxes flattened as x, y, width, height,
     * and cutouts for images that can be drawn by their own alpha.
     */
    private measure(viewport: DOMRect, reach: number) {
        const boxes: number[] = [];
        const cutouts: Cutout[] = [];
        const near = (rect: DOMRect) =>
            rect.width > 0 &&
            rect.height > 0 &&
            rect.right - viewport.left > -reach &&
            rect.bottom - viewport.top > -reach &&
            rect.left - viewport.left < viewport.width + reach &&
            rect.top - viewport.top < viewport.height + reach;
        for (const source of (this.sources ??= this.collect())) {
            const element = source instanceof Text ? source.parentElement! : source;
            // Optional: Safari only has it from 17.4.
            if (element.checkVisibility?.({ visibilityProperty: true }) === false) continue;
            if (element instanceof HTMLImageElement && readable(element)) {
                const rect = element.getBoundingClientRect();
                if (!near(rect)) continue;
                const [left, top, right, bottom] = visibleArea(element);
                // Unclipped sides end just past the view, so the clip stays finite for the canvas.
                const within = (value: number, size: number) =>
                    Math.round(Math.min(Math.max(value, -reach), size + reach));
                cutouts.push({
                    image: element,
                    box: [rect.left - viewport.left, rect.top - viewport.top, rect.width, rect.height].map(
                        Math.round,
                    ) as Cutout['box'],
                    clip: [
                        within(left - viewport.left, viewport.width),
                        within(top - viewport.top, viewport.height),
                        within(right - viewport.left, viewport.width),
                        within(bottom - viewport.top, viewport.height),
                    ],
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
                if (near(rect))
                    boxes.push(
                        Math.round(rect.left - viewport.left),
                        Math.round(rect.top - viewport.top),
                        Math.round(rect.width),
                        Math.round(rect.height),
                    );
        }
        return { boxes, cutouts };
    }

    /** Text nodes with something to show, and media elements, in document order. */
    private collect() {
        const sources: (Text | Element)[] = [];
        const walker = document.createTreeWalker(this.root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (node instanceof Text) return node.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
                const element = node as Element;
                if (element.matches(SKIP)) return NodeFilter.FILTER_REJECT;
                // A media element is one box; nothing inside it needs measuring.
                if (element.matches(MEDIA)) {
                    sources.push(element);
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_SKIP;
            },
        });
        while (walker.nextNode()) sources.push(walker.currentNode as Text);
        return sources;
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

    private draw(boxes: number[], cutouts: Cutout[], width: number, height: number, settings: CalmSettings) {
        const { canvas, context, scratch } = this;
        for (const target of cutouts.length ? [canvas, scratch] : [canvas])
            if (target.width !== width || target.height !== height) {
                target.width = width;
                target.height = height;
            } else canvas2d(target).clearRect(0, 0, width, height);
        // Expand every box by the radius with round corners, then blur the union: the feather.
        const radius = settings.radius / TEXEL;
        context.filter = settings.feather > 0 ? `blur(${settings.feather / TEXEL}px)` : 'none';
        context.fillStyle = '#fff';
        context.beginPath();
        for (let i = 0; i < boxes.length; i += 4)
            context.roundRect(
                boxes[i] / TEXEL - radius,
                boxes[i + 1] / TEXEL - radius,
                boxes[i + 2] / TEXEL + radius * 2,
                boxes[i + 3] / TEXEL + radius * 2,
                radius,
            );
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
        // Shape the falloff and scale it to the strength, through a lookup over the 256 alpha levels.
        const curve = Array.from({ length: 256 }, (_, a) => 255 * settings.strength * (a / 255) ** settings.exponent);
        const image = context.getImageData(0, 0, width, height),
            pixels = image.data;
        for (let i = 0; i < pixels.length; i += 4) {
            pixels[i] = TINT[0];
            pixels[i + 1] = TINT[1];
            pixels[i + 2] = TINT[2];
            pixels[i + 3] = curve[pixels[i + 3]];
        }
        context.putImageData(image, 0, 0);
    }
}
