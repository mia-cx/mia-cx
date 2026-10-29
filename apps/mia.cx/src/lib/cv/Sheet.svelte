<!--
    One printed A4 sheet in mia.cx's look: paper, hairline-ruled sections, and the field floating over
    the content as it does on the site. The CV's pages and the Appendix that follows them are sheets.
-->
<script lang="ts" module>
    export type Theme = 'colour' | 'print';
</script>

<script lang="ts">
    import type { Snippet } from 'svelte';
    import firstColour from './stills/cv-1-colour.webp';
    import firstPrint from './stills/cv-1-print.webp';
    import laterColour from './stills/cv-2-colour.webp';
    import laterPrint from './stills/cv-2-print.webp';

    /** Each Theme's stills have its fades baked in, since PDF readers drop CSS masks. */
    const first = { colour: firstColour, print: firstPrint };
    const later = { colour: laterColour, print: laterPrint };

    let {
        page,
        theme,
        /** 'rows' sets each section's heading in a column beside its content. */
        layout = 'stack',
        field,
        children,
    }: {
        /** Counts from 1: page 1 has its own field; every later page shares the second. */
        page: number;
        theme: Theme;
        layout?: 'stack' | 'rows';
        /** Replaces the baked field, for the stills bake to draw a live one. */
        field?: Snippet<[page: number]>;
        children: Snippet;
    } = $props();
</script>

<article class="sheet cv-sheet {layout}" class:first={page === 1} data-theme={theme} data-print-sheet>
    {#if field}
        {@render field(page)}
    {:else}
        <img class="field" src={(page === 1 ? first : later)[theme]} alt="" fetchpriority="low" decoding="async" />
    {/if}
    {@render children()}
</article>

<style>
    .sheet {
        --accent: #ff3d8a;
        padding: 14mm 14mm 12mm;
        /* The field blends with this sheet's paper only. */
        isolation: isolate;
        font-size: 8.6pt;
        line-height: 1.45;
        background: var(--paper);
        color: var(--ink);
    }
    [data-theme='colour'] {
        /* Ongoing entries run on in the accent, the one colour on the page. */
        --tail: var(--accent);
        --paper: #221820;
        --ink: #e9e5dd;
        --dim: #8f8b85;
        --line: rgb(233 229 221 / 0.14);
    }
    [data-theme='print'] {
        --paper: #fff;
        --ink: #1c161a;
        --dim: #6e6862;
        --line: #dcd8d3;
    }

    /*
     * The field floats over the text and the photo, as on the site: its alpha comes from luminance, so
     * only the bright lobes wash over. The bake already dimmed it around the content and faded it down
     * the sheet. Later pages sit lighter. Print multiplies it into white paper like ink.
     */
    .field {
        position: absolute;
        inset: 0;
        z-index: 2;
        width: 100%;
        height: 100%;
        pointer-events: none;
    }
    [data-theme='colour']:not(.first) .field {
        opacity: 0.5;
    }
    [data-theme='print'] .field {
        mix-blend-mode: multiply;
    }
    [data-theme='print']:not(.first) .field {
        opacity: 0.6;
    }

    /*
     * Defaults for what a sheet holds. Unscoped, so they outrank the site's element resets but not the
     * content's own classes: a class on a paragraph or link in the CV or Appendix wins.
     */
    :global(.cv-sheet h2) {
        margin: 0 0 2.5mm;
        font-size: 12pt;
        font-weight: 650;
        font-stretch: 76%;
        letter-spacing: -0.01em;
    }
    :global(.cv-sheet section) {
        margin-top: 4mm;
        padding-top: 3mm;
        border-top: 0.25mm solid var(--line);
    }
    /* The section that opens a sheet, straight after its field, needs no rule above it. */
    :global(.cv-sheet > :first-child + section) {
        margin-top: 0;
        padding-top: 0;
        border-top: 0;
    }
    :global(.cv-sheet p) {
        margin: 0 0 2mm;
    }
    :global(.cv-sheet.rows section) {
        display: grid;
        grid-template-columns: 30mm 1fr;
        gap: 0 6mm;
    }
    :global(.cv-sheet.rows section h2) {
        margin: 0;
    }

    /*
     * Links look exactly like the text around them, so paper shows nothing extra; the PDF still carries
     * them as clickable link annotations. Hover only exists on screen, so it never reaches print.
     */
    :global(.cv-sheet a) {
        color: inherit;
        text-decoration: none;
    }
    @media (hover: hover) {
        .sheet :global(a:hover) {
            color: var(--accent);
            text-decoration: underline;
            text-underline-offset: 0.15em;
        }
    }
</style>
