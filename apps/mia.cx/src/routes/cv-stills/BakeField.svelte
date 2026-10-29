<!--
    One sheet's field, drawn live and paused at a fixed seed and moment, dimmed around the sheet's own
    content. Marks itself `data-ready` once that frame is on screen, for scripts/cv-stills.ts to capture.
-->
<script lang="ts">
    import { onMount } from 'svelte';
    import { loadBakedRenderOptions } from '@mia-cx/atmosphere/baked-settings';
    import { CalmMask, type CalmOptions } from '@mia-cx/atmosphere/calm-mask';
    import { selectRenderBackend } from '@mia-cx/atmosphere/render-backend';

    let {
        name,
        seed,
        time,
        calm,
        fade,
    }: {
        name: string;
        seed: number;
        time: number;
        calm: CalmOptions;
        /** A mask the still is baked through, since PDF readers drop CSS masks. */
        fade?: string;
    } = $props();

    let canvas: HTMLCanvasElement;
    let ready = $state(false);
    /** Why the field couldn't be baked, for the script to report instead of waiting it out. */
    let failure = $state<string>();
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
            // The WebGL2 fallback draws a different field; a still from it would not match the others.
            if (renderer.backend !== 'webgpu') throw new Error(`the field drew with ${renderer.backend}, not WebGPU`);
            renderer.setPaused(true);
            renderer.setTime(time);
            await document.fonts.ready;
            mask.update(canvas.getBoundingClientRect());
            renderer.setCalmMask(mask.canvas);
            await renderer.firstFrame;
            // The paused redraw with the mask lands a frame or two after the first one.
            for (let i = 0; i < 3; i++) await frame();
            ready = true;
        })().catch((error) => (failure = error instanceof Error ? error.message : String(error)));
        return () => {
            mask.destroy();
            destroy();
        };
    });
</script>

<canvas
    bind:this={canvas}
    data-still={name}
    data-ready={ready || undefined}
    data-error={failure}
    style:mask-image={fade}
></canvas>

<style>
    canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }
</style>
