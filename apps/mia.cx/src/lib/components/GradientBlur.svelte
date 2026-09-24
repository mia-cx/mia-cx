<script lang="ts">
    /**
     * Ported from mia-cx/maal. `detail` stacked layers, each with an exponentially larger backdrop
     * blur and a four-stop mask that reveals only its own band, so the blur ramps instead of stepping.
     * It composites over the WebGPU canvas, which is why the header can sit on top of the field.
     */
    let {
        blur = 24,
        detail = 8,
        angle = 'to top',
        class: className = '',
    }: { blur?: number; detail?: number; angle?: string; class?: string } = $props();

    const layers = $derived(
        Array.from({ length: detail }, (_, i) => {
            // Exponential from blur/256 up to blur, so the ramp reads as smooth rather than linear.
            const radius = 0.5 ** 8 * blur * 2 ** (8 * (i / Math.max(1, detail - 1)));
            const stops = Array.from({ length: 4 }, (_, j) => {
                const at = ((i + j) / (detail + 1)) * 100;
                return `${j === 0 || j === 3 ? 'transparent' : '#000'} ${at.toFixed(2)}%`;
            });
            return { radius, mask: `linear-gradient(${angle}, ${stops.join(', ')})` };
        }),
    );
</script>

<div class="gradient-blur {className}" aria-hidden="true">
    {#each layers as layer, i (i)}
        <div style:--blur="{layer.radius}px" style:--mask={layer.mask} style:z-index={i}></div>
    {/each}
</div>

<style>
    .gradient-blur {
        position: absolute;
        inset: -1rem;
        pointer-events: none;
    }
    .gradient-blur > div {
        position: absolute;
        inset: 0;
        -webkit-mask-image: var(--mask);
        mask-image: var(--mask);
    }
    @supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
        .gradient-blur > div {
            -webkit-backdrop-filter: blur(var(--blur));
            backdrop-filter: blur(var(--blur));
        }
    }
</style>
