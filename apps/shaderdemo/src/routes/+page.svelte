<script lang="ts">
    import { onMount } from 'svelte';
    import { BAKED_RENDER_OPTIONS, loadBakedRenderOptions } from '$lib/baked-settings';
    import { selectRenderBackend, type RenderBackend } from '$lib/render-backend';
    import { CursorState } from '$lib/cursor';
    import { CursorDensityField } from '$lib/cursor-density-field';

    let canvas: HTMLCanvasElement;
    let renderer: RenderBackend | undefined;
    let ready = $state(false);
    let status = $state('Starting graphics…');
    let options = BAKED_RENDER_OPTIONS;
    const cursorState = new CursorState();
    const cursorDensityField = new CursorDensityField();
    let densityPoints: { x: number; y: number; timeStamp: number }[] = [];
    let paused = false;

    function sendCursor() {
        renderer?.setCursorState(cursorState);
    }
    function resetDensityStroke() {
        densityPoints = [];
        cursorDensityField.endStroke(false);
        renderer?.resetCursorDensityStroke?.();
    }
    function resizeCursorDensity(rect: DOMRect) {
        if (renderer?.backend === 'webgpu') return;
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

    onMount(() => {
        let disposed = false;
        const pageSeed = Math.random() * 1000;
        options = { ...BAKED_RENDER_OPTIONS, seed: pageSeed };
        paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
        loadBakedRenderOptions()
            .then((loadedOptions) => selectRenderBackend(canvas, { ...loadedOptions, seed: pageSeed }))
            .then(({ renderer: instance }) => {
                if (disposed) return instance.destroy();
                renderer = instance;
                instance.setCursorState(cursorState);
                const rect = canvas.getBoundingClientRect();
                if (instance.backend === 'webgl2') {
                    cursorDensityField.resize(rect.width, rect.height);
                    instance.setCursorDensityField(cursorDensityField.snapshot());
                }
                instance.setPaused(paused);
                instance.onLost = (message) => {
                    ready = false;
                    status = message;
                };
                ready = true;
                status = '';
            })
            .catch((error) => {
                if (!disposed) status = error instanceof Error ? error.message : String(error);
            });

        let cursorFrame = 0;
        let cursorTime = performance.now();
        const animateCursor = (now: number) => {
            if (!document.hidden) {
                const dt = (now - cursorTime) / 1000;
                if (!paused) {
                    cursorState.tick(dt);
                    sendCursor();
                }
                const rect = canvas.getBoundingClientRect();
                resizeCursorDensity(rect);
                const batch = densityPoints;
                densityPoints = [];
                const gpuPath = renderer?.backend === 'webgpu';
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
        window.addEventListener('blur', pointerLeave);
        return () => {
            disposed = true;
            resetDensityStroke();
            document.removeEventListener('visibilitychange', visibility);
            window.removeEventListener('pointermove', pointerMove);
            window.removeEventListener('pointerdown', pointerDown);
            window.removeEventListener('pointerup', pointerUp);
            window.removeEventListener('pointercancel', pointerLeave);
            window.removeEventListener('blur', pointerLeave);
            cancelAnimationFrame(cursorFrame);
            renderer?.destroy();
        };
    });
</script>

<svelte:head>
    <title>Noise Field — GPU</title>
    <meta name="description" content="An animated transparent GPU noise field." />
</svelte:head>

<canvas class:ready bind:this={canvas} aria-label="Animated coloured noise field"></canvas>
{#if !ready}<p class="status" role="status" aria-live="polite">{status}</p>{/if}

<style>
    :global(*) {
        box-sizing: border-box;
    }
    :global(html, body) {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: #070809;
    }
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
    canvas.ready {
        opacity: 1;
        transition: opacity 0.35s ease;
    }
    .status {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
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
