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

<svelte:head>
    {#if article}
        <!--
            Safari repeats no padding across printed pages, so on an Article's middle pages the text
            would run to the paper's edge. There it prints inside page margins instead, the same as
            <main>'s padding elsewhere; the paper stops at them. Only on Articles: CV sheets need none.
        -->
        <style>
            @supports (font: -apple-system-body) {
                /* Against print.css's margin: 0, which comes after this in the document. */
                @page {
                    margin: 18mm 20mm !important;
                }
            }
        </style>
    {/if}
</svelte:head>

{#if article}
    <div data-print-paper>{@render paper?.()}</div>
{:else}
    <div data-print>{@render children()}</div>
{/if}
