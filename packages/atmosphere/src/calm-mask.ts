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

export class CalmMask {
    private readonly context: CanvasRenderingContext2D;
    private readonly range = document.createRange();
    private readonly observer: MutationObserver;
    private sources?: (Text | Element)[];
    private signature = '';

    constructor(
        readonly canvas: HTMLCanvasElement,
        private readonly root: Element = document.body,
    ) {
        this.context = canvas.getContext('2d', { willReadFrequently: true })!;
        // Text and images come and go with route changes; positions are re-read every frame anyway.
        this.observer = new MutationObserver(() => (this.sources = undefined));
        this.observer.observe(root, { childList: true, subtree: true, characterData: true });
    }

    /** Redraws the mask for the current layout. Returns whether it changed and needs uploading. */
    update(viewport: DOMRect, settings: CalmSettings): boolean {
        const width = Math.max(1, Math.ceil(viewport.width / TEXEL)),
            height = Math.max(1, Math.ceil(viewport.height / TEXEL));
        const reach = settings.radius + settings.feather * 3;
        const boxes = this.measure(viewport, reach);
        const signature = `${width}x${height}:${Object.values(settings)}:${boxes}`;
        if (signature === this.signature) return false;
        this.signature = signature;
        this.draw(boxes, width, height, settings);
        return true;
    }

    destroy() {
        this.observer.disconnect();
    }

    /** Viewport-relative boxes, flattened as x, y, width, height, of everything within reach of the view. */
    private measure(viewport: DOMRect, reach: number) {
        const boxes: number[] = [];
        for (const source of (this.sources ??= this.collect())) {
            const element = source instanceof Text ? source.parentElement! : source;
            // Optional: Safari only has it from 17.4.
            if (element.checkVisibility?.({ visibilityProperty: true }) === false) continue;
            let rects: Iterable<DOMRect>;
            if (source instanceof Text) {
                // Screen-reader-only text lays out as full lines inside a 1px clip.
                const parent = element.getBoundingClientRect();
                if (parent.width <= 1 && parent.height <= 1) continue;
                this.range.selectNodeContents(source);
                rects = this.range.getClientRects();
            } else rects = [source.getBoundingClientRect()];
            for (const rect of rects) {
                const x = rect.left - viewport.left,
                    y = rect.top - viewport.top;
                if (rect.width <= 0 || rect.height <= 0) continue;
                if (x + rect.width < -reach || y + rect.height < -reach) continue;
                if (x > viewport.width + reach || y > viewport.height + reach) continue;
                boxes.push(Math.round(x), Math.round(y), Math.round(rect.width), Math.round(rect.height));
            }
        }
        return boxes;
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

    private draw(boxes: number[], width: number, height: number, settings: CalmSettings) {
        const { canvas, context } = this;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        } else context.clearRect(0, 0, width, height);
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
