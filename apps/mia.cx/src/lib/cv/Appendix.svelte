<!--
    An index page's Appendix, printed after the CV on the same sheets: the index's name as a heading
    on the first sheet, then a full-width list, each item with its tagline, its address and a QR code.
-->
<script lang="ts">
    import { QRCode, type Appendix } from '@mia-cx/print';
    import Sheet from './Sheet.svelte';

    let { appendix }: { appendix: Appendix } = $props();

    /** How many items fit on a sheet, hairline rows with a 15 mm code each. */
    const PER_SHEET = 12;
    const sheets = $derived(
        Array.from({ length: Math.ceil(appendix.items.length / PER_SHEET) }, (_, i) =>
            appendix.items.slice(i * PER_SHEET, (i + 1) * PER_SHEET),
        ),
    );
    const printed = (url: string) => url.replace(/^https?:\/\//, '');
</script>

{#each sheets as items, i (i)}
    <!-- After the CV's two pages, so each sheet takes the later pages' field. -->
    <Sheet page={3 + i} theme="print">
        <section>
            {#if i === 0}<h2>{appendix.title}</h2>{/if}
            <ul>
                {#each items as { title, tagline, url } (title)}
                    <li>
                        <div>
                            <h3 class="line">{title}</h3>
                            <span class="line">{tagline}</span>
                            {#if url}<span class="line url"><a href={url}>{printed(url)}</a></span>{/if}
                        </div>
                        <!-- The address above is the link for readers; the code is for phones. -->
                        {#if url}<a class="qr" href={url} tabindex="-1" aria-hidden="true"><QRCode {url} /></a>{/if}
                    </li>
                {/each}
            </ul>
        </section>
    </Sheet>
{/each}

<style>
    li {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 15mm;
        gap: 6mm;
        align-items: start;
        padding: 2.6mm 0;
        border-top: 0.25mm solid var(--line);
    }
    li:first-child {
        padding-top: 0;
        border-top: 0;
    }
    h3 {
        font-size: 9.4pt;
        font-weight: 650;
    }
    /* One line each, tighter than the sheet's paragraphs: every row has the same height, so twelve always fit. */
    .line {
        display: block;
        margin: 0 0 0.6mm;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    /* The link inherits it: the sheet sets links in the colour of their text. */
    .url {
        color: var(--dim);
    }
    /* Above the field, like the face, so its light never lowers the code's contrast. */
    .qr {
        position: relative;
        z-index: 3;
        display: block;
        width: 15mm;
        height: 15mm;
    }
    .qr :global(svg) {
        width: 100%;
        height: 100%;
    }
</style>
