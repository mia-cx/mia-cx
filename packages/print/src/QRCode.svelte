<!--
    A QR code for paper, as inline SVG in the current text colour, with no quiet zone of its own:
    the paper around it is the quiet zone. Size it with CSS.
-->
<script lang="ts">
    import { encode } from 'uqr';

    let { url }: { url: string } = $props();

    const code = $derived(encode(url, { border: 0 }));
    /** One unit square per dark module, joined into a single path. */
    const path = $derived(
        code.data.flatMap((row, y) => row.flatMap((on, x) => (on ? [`M${x} ${y}h1v1h-1z`] : []))).join(''),
    );
</script>

<svg viewBox="0 0 {code.size} {code.size}" aria-hidden="true"><path d={path} /></svg>

<style>
    svg {
        display: block;
        fill: currentColor;
        shape-rendering: crispEdges;
    }
</style>
