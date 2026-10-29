<!--
    The CV's portrait layers, faded through their masks here so the printed CV needs no CSS masks:
    PDF readers drop them. The portrait fades out in an ellipse, (1 − u²)^2.8 from 45% of its radius;
    the face copy, which sits above the field, is cut to a feathered ellipse around the face, and in
    Colour it carries the field's 14% haze. Values, in shares of the photo, from the CV look prototype.
-->
<script lang="ts">
    import { onMount } from 'svelte';
    import portrait from '$lib/assets/portrait-1200.webp';

    const FADE_STEPS = 16;
    const fade = `radial-gradient(ellipse 58% 34% at 50% 16%, ${Array.from({ length: FADE_STEPS + 1 }, (_, i) => {
        const u = i / FADE_STEPS;
        return `rgb(0 0 0 / ${((1 - u * u) ** 2.8).toFixed(3)}) ${((0.45 + 0.55 * u) * 100).toFixed(1)}%`;
    }).join(', ')})`;
    const face = 'radial-gradient(ellipse 34% 20% at 50% 12%, #000 55%, transparent 100%)';

    const layers = [
        { name: 'portrait', mask: fade, haze: false },
        { name: 'face-colour', mask: `${fade}, ${face}`, haze: true },
        { name: 'face-print', mask: `${fade}, ${face}`, haze: false },
    ];

    let root: HTMLElement;
    let ready = $state(false);
    onMount(() => {
        Promise.all([...root.querySelectorAll('img')].map((img) => img.decode())).then(() => (ready = true));
    });
</script>

<div class="portraits" bind:this={root}>
    {#each layers as { name, mask, haze } (name)}
        <div class="layer" data-still={name} data-scale="3" data-ready={ready || undefined}>
            <img src={portrait} alt="" style:mask-image={mask} />
            {#if haze}<div class="haze" style:mask-image="url({portrait}), {mask}"></div>{/if}
        </div>
    {/each}
</div>

<style>
    .portraits {
        display: flex;
        gap: 10mm;
    }
    /* The size the CV sets the portrait at. */
    .layer {
        position: relative;
        width: 78mm;
    }
    img {
        display: block;
        width: 100%;
        mask-composite: intersect;
    }
    .haze {
        position: absolute;
        inset: 0;
        background: rgb(221 138 231);
        opacity: 0.14;
        mask-size: 100% 100%;
        mask-composite: intersect;
    }
</style>
