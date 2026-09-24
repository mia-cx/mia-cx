<script lang="ts">
    /**
     * Ported from mia-cx/maal. A gradient whose colour is interpolated on an easing curve rather than
     * linearly, so the tint falls off without the usual grey band through the middle.
     */
    let {
        from = 'var(--bg)',
        to = 'transparent',
        angle = 'to bottom',
        detail = 8,
        /** 'out' falls off immediately; 'in' holds the colour then drops, which is what a scrim wants. */
        ease = 'out',
        class: className = '',
    }: {
        from?: string;
        to?: string;
        angle?: string;
        detail?: number;
        ease?: 'in' | 'out';
        class?: string;
    } = $props();

    const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
    const easeInQuad = (t: number) => t * t;

    const image = $derived.by(() => {
        const stops = Array.from({ length: detail + 1 }, (_, step) => {
            const t = step / detail;
            const curve = ease === 'in' ? easeInQuad : easeOutQuad;
            const mix = (curve(t) * 100).toFixed(2);
            return `color-mix(in oklch, ${from}, ${to} ${mix}%) ${(t * 100).toFixed(2)}%`;
        });
        return `linear-gradient(${angle}, ${stops.join(', ')})`;
    });
</script>

<div class="eased-gradient {className}" style:background-image={image} aria-hidden="true"></div>

<style>
    .eased-gradient {
        pointer-events: none;
        background-repeat: no-repeat;
        background-size: 100% 100%;
    }
</style>
