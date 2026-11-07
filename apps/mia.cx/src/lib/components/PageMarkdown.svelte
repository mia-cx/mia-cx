<!--
    The current page as Markdown, joined like the CV's split button: "View as Markdown" opens the
    page's `.md` twin, then an icon button copies it, named by a popover that shows at once on hover
    or focus. Each page places it at the top; the layout links every twin from the head.
-->
<script lang="ts" module>
    import { building } from '$app/environment';
    import { markdownPath } from '$lib/markdown';

    /** The page's Markdown twin, with the query, so /cv?role=… gets that role's CV. Prerendered pages have none. */
    export const markdownHref = (url: URL) => markdownPath(url.pathname) + (building ? '' : url.search);
</script>

<script lang="ts">
    import { page } from '$app/state';
    import Check from '~icons/lucide/check';
    import Copy from '~icons/lucide/copy';
    import FileCode from '~icons/lucide/file-code';
    import X from '~icons/lucide/x';

    const href = $derived(markdownHref(page.url));
    const COPIED_MS = 2000;
    let status = $state<'idle' | 'copied' | 'failed'>('idle');
    const tip = $derived(status === 'copied' ? 'Copied' : status === 'failed' ? 'Couldn’t copy' : 'Copy as Markdown');

    async function copy() {
        // The fetch goes into the ClipboardItem as a promise, so Safari still counts this as the click.
        const text = fetch(href).then(async (response) => {
            if (!response.ok) throw new Error(`${href}: ${response.status}`);
            return new Blob([await response.text()], { type: 'text/plain' });
        });
        try {
            await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text })]);
            status = 'copied';
        } catch (error) {
            console.error(error);
            status = 'failed';
        }
        setTimeout(() => (status = 'idle'), COPIED_MS);
    }
</script>

<div class="page-markdown" data-print-hide data-markdown="skip">
    <!-- Not a route, so the router must hand it to the browser. -->
    <a {href} data-sveltekit-reload><span class="label">View as Markdown</span> <FileCode aria-hidden="true" /></a>
    <button type="button" class="icon" onclick={copy} aria-label={tip} class:shown={status !== 'idle'}>
        {#if status === 'copied'}<Check aria-hidden="true" />{:else if status === 'failed'}<X
                aria-hidden="true"
            />{:else}<Copy aria-hidden="true" />{/if}
        <span class="tip" aria-hidden="true">{tip}</span>
    </button>
    <span class="visually-hidden" aria-live="polite">{status === 'idle' ? '' : tip}</span>
</div>

<style>
    .page-markdown {
        /* Icon boxes, in cap heights of the label. */
        --icon: 1.5;
        display: flex;
    }
    a,
    button {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        height: 40px;
        padding: 0 12px;
        border: 1px solid var(--panel-line);
        background: var(--control);
        color: var(--ink);
        font: inherit;
        font-size: 15px;
        text-decoration: none;
        cursor: pointer;
        transition:
            border-color 140ms ease,
            color 140ms ease;
    }
    /* The second half shares the first's border. */
    button {
        margin-left: -1px;
    }
    a:hover,
    a:focus-visible,
    button:hover,
    button:focus-visible {
        position: relative;
        z-index: 1;
        border-color: var(--accent);
        color: var(--accent);
    }
    .page-markdown :global(svg) {
        width: calc(var(--icon) * 1cap);
        height: calc(var(--icon) * 1cap);
    }
    .page-markdown :global(svg *) {
        vector-effect: non-scaling-stroke;
        stroke-width: 0.065em;
    }
    .icon {
        position: relative;
        justify-content: center;
        width: 40px;
        padding: 0;
    }
    /* Trimmed to cap height and baseline, so centring lines the icon up with the capitals. */
    .label {
        text-box: trim-both cap alphabetic;
    }
    /* Instant, unlike a title tooltip; also shows while the copy reports back. */
    .tip {
        position: absolute;
        top: calc(100% + 6px);
        /* Hung from the button's right edge, so it never pushes past the page's. */
        right: -1px;
        padding: 4px 8px;
        border: 1px solid var(--panel-line);
        background: var(--panel);
        color: var(--ink);
        font-size: 13px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
    }
    .icon:hover .tip,
    .icon:focus-visible .tip,
    .shown .tip {
        opacity: 1;
    }
</style>
