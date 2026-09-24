<script lang="ts">
    /**
     * Fixed, full-viewport, transparent shader layer. Copied from the shaderdemo page and turned
     * into a component so each site direction can place content over it.
     */
    import { onMount, untrack } from 'svelte';
    import { BAKED_RENDER_OPTIONS, loadBakedRenderOptions } from './baked-settings';
    import { selectRenderBackend, type RenderBackend } from './render-backend';
    import { CursorState } from './cursor';
    import { CursorDensityField } from './cursor-density-field';

    let {
        /** Ceiling for adaptive resolution, 1 is full. Lower it when most of the canvas is covered. */
        renderScale = 1,
        /**
         * Device pixel ratio ceiling. The field is smooth and low-frequency, so rendering at 2x or 3x
         * on a HiDPI display costs 4–9x the pixels for nothing you can see. 1.5 keeps edges clean.
         */
        dprCap = 1.5,
        /** CSS opacity of the finished layer. */
        opacity = 1,
        /** Whether the cursor paints density into the field. */
        interactive = true,
        /** 'front' floats the light over the page content, 'back' puts it behind. */
        layer = 'front',
        class: className = '',
        /** Dim by half as the page's hero scrolls away. Only meaningful on a page that has one. */
        dims = false,
        label = 'Animated coloured noise field',
        /** Called once, when the first frame is up or when graphics fail; the page reveals on it. */
        onsettle,
    }: {
        renderScale?: number;
        dprCap?: number;
        opacity?: number;
        interactive?: boolean;
        layer?: 'front' | 'back';
        class?: string;
        dims?: boolean;
        label?: string;
        onsettle?: () => void;
    } = $props();

    let canvas: HTMLCanvasElement;
    let renderer: RenderBackend | undefined;
    let ready = $state(false);
    let status = $state('Starting graphics…');
    let fps = $state(0);
    let fpsVisible = $state(false);
    let options = BAKED_RENDER_OPTIONS;
    const cursorState = new CursorState();
    const cursorDensityField = new CursorDensityField();
    let densityPoints: { x: number; y: number; timeStamp: number }[] = [];
    let paused = false;

    /*
     * Route changes hand the dim between the scroll animation and the base opacity. A browser will
     * not transition *from* an animated value once the animation is removed, so leaving a hero page
     * freezes the current value inline first and releases it a frame later; entering one eases to
     * the base value and only then attaches the animation, whose start keyframe equals it.
     */
    let animated = $state(dims);
    let held = $state<string | null>(null);

    /*
     * Browsers without scroll-driven animations get the same dim from an IntersectionObserver on the
     * hero: its callbacks fire only at the thresholds, and the canvas's opacity transition smooths
     * the steps, so scrolling still costs nothing per tick. `fallbackDim` stays 1 where the CSS
     * animation runs, so the two never fight.
     */
    let fallbackDim = $state(1);
    $effect(() => {
        if (!dims || typeof CSS === 'undefined' || CSS.supports('animation-timeline: --hero')) {
            fallbackDim = 1;
            return;
        }
        const hero = document.querySelector('[data-section="hero"]');
        if (!hero) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                // Exit progress, as the CSS range does: 0 while the hero fills the view, 1 once 90% of it has gone.
                const exit = entry.boundingClientRect.top >= 0 ? 0 : Math.min(1, (1 - entry.intersectionRatio) / 0.9);
                fallbackDim = 1 - 0.5 * exit;
            },
            { threshold: Array.from({ length: 11 }, (_, i) => i / 10) },
        );
        observer.observe(hero);
        return () => {
            observer.disconnect();
            fallbackDim = 1;
        };
    });
    $effect(() => {
        const wantsAnimation = dims;
        // Reading `animated` reactively would re-run this effect the moment it flips and cancel
        // the release below, so it is read outside tracking.
        if (wantsAnimation === untrack(() => animated)) return;
        if (!wantsAnimation) {
            held = canvas ? getComputedStyle(canvas).opacity : null;
            animated = false;
            let frame = requestAnimationFrame(() => {
                frame = requestAnimationFrame(() => (held = null));
            });
            return () => cancelAnimationFrame(frame);
        }
        const timer = setTimeout(() => (animated = true), 650);
        return () => clearTimeout(timer);
    });

    function sendCursor() {
        renderer?.setCursorState(cursorState);
    }

    /** Fires once: on the first frame, on a failed start, or on a device lost before either. */
    let settled = false;
    function settle() {
        if (settled) return;
        settled = true;
        onsettle?.();
    }
    function resetDensityStroke() {
        densityPoints = [];
        cursorDensityField.endStroke(false);
        renderer?.resetCursorDensityStroke?.();
    }
    function resizeCursorDensity(rect: DOMRect) {
        if (renderer?.gpuCursorDensity) return;
        if (cursorDensityField.resize(rect.width, rect.height))
            renderer?.setCursorDensityField?.(cursorDensityField.snapshot());
    }
    function pointerMove(event: PointerEvent, depositDensity = true) {
        const samples = event.getCoalescedEvents?.() ?? [event];
        const rect = canvas.getBoundingClientRect();
        resizeCursorDensity(rect);
        for (const sample of samples) {
            cursorState.update(sample.clientX, sample.clientY, rect, sample.timeStamp, true);
            if (
                depositDensity &&
                interactive &&
                options.parameters.cursorEnabled !== 0 &&
                options.parameters.cursorDensityPressureEnabled !== 0
            )
                densityPoints.push({ x: cursorState.x, y: cursorState.y, timeStamp: sample.timeStamp });
            else if (depositDensity) resetDensityStroke();
        }
        sendCursor();
    }
    function pointerDown(event: PointerEvent) {
        pointerMove(event, false);
        cursorState.pointerDown();
        sendCursor();
    }
    function pointerUp() {
        cursorState.pointerUp();
        sendCursor();
    }
    function pointerLeave() {
        resetDensityStroke();
        cursorState.leave();
        sendCursor();
    }
    function keyDown(event: KeyboardEvent) {
        if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.key.toLowerCase() !== 'f') return;
        if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable]')) return;
        fpsVisible = !fpsVisible;
    }

    onMount(() => {
        let disposed = false;
        const pageSeed = Math.random() * 1000;
        options = { ...BAKED_RENDER_OPTIONS, seed: pageSeed, renderScale, dprCap };
        paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
        loadBakedRenderOptions()
            .then((loadedOptions) => {
                options = { ...loadedOptions, seed: pageSeed, renderScale, dprCap };
                return selectRenderBackend(canvas, options);
            })
            .then(({ renderer: instance }) => {
                if (disposed) return instance.destroy();
                renderer = instance;
                let lastFpsUpdate = 0;
                instance.onStats = (nextFps) => {
                    if (!fpsVisible) return;
                    const now = performance.now();
                    if (now - lastFpsUpdate < 500) return;
                    lastFpsUpdate = now;
                    fps = nextFps;
                };
                instance.setCursorState(cursorState);
                const rect = canvas.getBoundingClientRect();
                if (!instance.gpuCursorDensity) {
                    cursorDensityField.resize(rect.width, rect.height);
                    instance.setCursorDensityField(cursorDensityField.snapshot());
                }
                instance.setPaused(paused);
                instance.onLost = (message) => {
                    ready = false;
                    status = message;
                    // A device lost before its first frame would otherwise leave the page hidden.
                    settle();
                };
                return (instance.firstFrame ?? Promise.resolve()).then(() => {
                    if (disposed) return;
                    ready = true;
                    status = '';
                    settle();
                });
            })
            .catch((error) => {
                if (!disposed) status = error instanceof Error ? error.message : String(error);
                settle();
            });

        let cursorFrame = 0;
        let cursorTime = performance.now();
        const animateCursor = (now: number) => {
            if (!document.hidden) {
                const dt = Math.max(0, (now - cursorTime) / 1000);
                if (!paused) {
                    cursorState.tick(dt);
                    sendCursor();
                }
                const rect = canvas.getBoundingClientRect();
                resizeCursorDensity(rect);
                const batch = densityPoints;
                densityPoints = [];
                const gpuPath = renderer?.gpuCursorDensity === true;
                const painted = gpuPath
                    ? false
                    : cursorDensityField.addStrokeBatch(
                          batch,
                          options.parameters.cursorDensityRadius,
                          options.parameters.cursorDensityPressureFalloff,
                          options.parameters.cursorDensityBuildUp,
                      );
                const densityTick = gpuPath
                    ? { changed: false, active: false }
                    : cursorDensityField.tick(dt, options.parameters.cursorDensityDecay);
                if (painted || densityTick.changed) renderer?.setCursorDensityField?.(cursorDensityField.snapshot());
                renderer?.queueCursorDensityUpdate?.({
                    points: batch,
                    cssWidth: rect.width,
                    cssHeight: rect.height,
                    dt,
                    radius: options.parameters.cursorDensityRadius,
                    falloff: options.parameters.cursorDensityPressureFalloff,
                    buildUpSeconds: options.parameters.cursorDensityBuildUp,
                    decayRate: options.parameters.cursorDensityDecay,
                });
            }
            cursorTime = now;
            cursorFrame = requestAnimationFrame(animateCursor);
        };
        cursorFrame = requestAnimationFrame(animateCursor);
        const visibility = () => {
            renderer?.setPaused(document.hidden || paused);
            if (document.hidden) pointerLeave();
            cursorTime = performance.now();
        };
        document.addEventListener('visibilitychange', visibility);
        window.addEventListener('pointermove', pointerMove);
        window.addEventListener('pointerdown', pointerDown);
        window.addEventListener('pointerup', pointerUp);
        window.addEventListener('pointercancel', pointerLeave);
        // Leaving the viewport for browser chrome fires neither pointercancel nor blur, and the next
        // move would otherwise draw a stroke from the stale endpoint.
        document.documentElement.addEventListener('pointerleave', pointerLeave);
        window.addEventListener('blur', pointerLeave);
        window.addEventListener('keydown', keyDown);
        return () => {
            disposed = true;
            resetDensityStroke();
            document.removeEventListener('visibilitychange', visibility);
            window.removeEventListener('pointermove', pointerMove);
            window.removeEventListener('pointerdown', pointerDown);
            window.removeEventListener('pointerup', pointerUp);
            window.removeEventListener('pointercancel', pointerLeave);
            document.documentElement.removeEventListener('pointerleave', pointerLeave);
            window.removeEventListener('blur', pointerLeave);
            window.removeEventListener('keydown', keyDown);
            cancelAnimationFrame(cursorFrame);
            renderer?.destroy();
        };
    });
</script>

<canvas
    class:ready
    class:dims={animated}
    class="{layer} {className}"
    bind:this={canvas}
    style:--shader-opacity={opacity * fallbackDim}
    style:opacity={held}
    aria-label={label}
></canvas>
{#if ready && fpsVisible}<output class="fps" aria-label="Frames per second">{fps.toFixed(1)} FPS</output>{/if}
{#if !ready}<p class="visually-hidden" role="status" aria-live="polite">{status}</p>{/if}

<style>
    canvas {
        position: fixed;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
        width: 100lvw;
        height: 100lvh;
        pointer-events: none;
        opacity: 0;
        background: transparent;
    }
    canvas.front {
        z-index: 5;
    }
    canvas.back {
        z-index: 0;
    }
    /*
     * Light mode inverts the field's lightness and rotates hue back by 180°, so the lobes read as
     * ink on paper with their original hues. Alpha is untouched: dark areas stay transparent.
     */
    :global(:root[data-theme='light']) canvas {
        filter: invert(1) hue-rotate(180deg);
    }
    @media (prefers-color-scheme: light) {
        :global(:root:not([data-theme])) canvas {
            filter: invert(1) hue-rotate(180deg);
        }
    }

    canvas.ready {
        opacity: var(--shader-opacity, 1);
        /* Route changes swap the base opacity; on a hero page the scroll animation overrides this. */
        transition: opacity 600ms ease;
    }

    /*
     * The field drops to half as the hero scrolls away, on the hero's own view timeline so it moves
     * in lockstep with the header's spill. Opacity is animated directly, on the compositor: no
     * custom properties, no calc(), no transition to fight it, and nothing on the main thread per
     * scroll tick. Pages without a hero pass a halved `opacity` prop instead.
     */
    @supports (animation-timeline: --hero) {
        @keyframes shader-dim {
            from {
                opacity: 1;
            }
            to {
                opacity: 0.5;
            }
        }
        canvas.ready.dims {
            animation: shader-dim linear both;
            animation-timeline: --hero;
            animation-range: exit 0% 90%;
        }
    }
    .fps {
        position: fixed;
        top: max(0.5rem, env(safe-area-inset-top));
        left: max(0.5rem, env(safe-area-inset-left));
        z-index: 50;
        padding: 0.25rem 0.4rem;
        color: #fff;
        background: rgb(0 0 0 / 70%);
        font:
            12px/1.2 ui-monospace,
            monospace;
        pointer-events: none;
    }
    @supports (-webkit-touch-callout: none) {
        canvas {
            position: fixed;
            top: 0;
            right: 0;
            bottom: auto;
            left: 0;
            width: 100%;
            height: 100dvh;
        }
    }
</style>
