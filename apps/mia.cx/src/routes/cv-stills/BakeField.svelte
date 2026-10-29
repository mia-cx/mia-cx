<!--
    One sheet's field, drawn live and paused at a fixed seed and moment, dimmed around the sheet's own
    content. Marks itself `data-ready` once that frame is on screen, for scripts/cv-stills.ts to capture.
-->
<script lang="ts">
    import { onMount } from 'svelte';
    import { loadBakedRenderOptions } from '@mia-cx/atmosphere/baked-settings';
    import { CalmMask, type CalmOptions } from '@mia-cx/atmosphere/calm-mask';
    import { selectRenderBackend } from '@mia-cx/atmosphere/render-backend';

    let { name, seed, time, calm }: { name: string; seed: number; time: number; calm: CalmOptions } = $props();

    let canvas: HTMLCanvasElement;
    let ready = $state(false);
    const frame = () => new Promise(requestAnimationFrame);

    onMount(() => {
        const mask = new CalmMask(canvas.closest('[data-print-sheet]')!, calm);
        let destroy = () => {};
        (async () => {
            const options = await loadBakedRenderOptions();
            // The printed field has no centre darkening: the calm mask alone keeps it off the content.
            const parameters = { ...options.parameters, centerDarkness: 0 };
            const { renderer } = await selectRenderBackend(canvas, {
                ...options,
                seed,
                parameters,
                renderScale: 1,
                dprCap: 2,
            });
            destroy = () => renderer.destroy();
            renderer.setPaused(true);
            renderer.setTime(time);
            await document.fonts.ready;
            mask.update(canvas.getBoundingClientRect());
            renderer.setCalmMask(mask.canvas);
            await renderer.firstFrame;
            // The paused redraw with the mask lands a frame or two after the first one.
            for (let i = 0; i < 3; i++) await frame();
            ready = true;
        })();
        return () => {
            mask.destroy();
            destroy();
        };
    });
</script>

<canvas bind:this={canvas} data-still={name} data-ready={ready || undefined}></canvas>

<style>
    canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }
</style>
