<!--
    Swaps print-only content in for the page. On screen the content never shows; in print it is all
    that shows, unless the page is an Article, which prints its own <main> on white paper instead,
    over the optional `paper`. Render it once, in the root layout, outside <main>, so tools that read
    <main> never see it.
-->
<script lang="ts">
    import type { Snippet } from 'svelte';
    import './print.css';

    let {
        /** Whether the current page is an Article. Each site decides where the flag comes from. */
        article = false,
        /** What prints instead of the page, such as a CV followed by an Appendix. */
        children,
        /** Drawn under a printed Article, such as a field; position it behind <main>. */
        paper,
    }: { article?: boolean; children: Snippet; paper?: Snippet } = $props();
</script>

{#if article}
    <div data-print-paper>{@render paper?.()}</div>
{:else}
    <div data-print>{@render children()}</div>
{/if}
