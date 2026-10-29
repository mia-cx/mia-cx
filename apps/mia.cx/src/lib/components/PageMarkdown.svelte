<script lang="ts">
    /** The current page as Markdown: open its `.md` twin, or copy it. Also what gets the twins prerendered. */
    import { building } from '$app/environment';
    import { page } from '$app/state';
    import { ArrowLink } from '@mia-cx/ui';
    import { markdownPath } from '$lib/markdown';

    // With the query, so /cv?role=… copies that role's CV. Prerendered pages have none to read.
    const href = $derived(markdownPath(page.url.pathname) + (building ? '' : page.url.search));
    const COPIED_MS = 2000;
    let status = $state<'idle' | 'copied' | 'failed'>('idle');

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

<svelte:head>
    <link rel="alternate" type="text/markdown" {href} />
</svelte:head>

<div class="markdown container mono">
    <!-- Not a route, so the router must hand it to the browser. -->
    <ArrowLink {href} data-sveltekit-reload>View as Markdown</ArrowLink>
    <!-- Last in the row, so its changing label moves nothing else. -->
    <button type="button" onclick={copy} aria-live="polite">
        {status === 'copied' ? 'Copied' : status === 'failed' ? 'Couldn’t copy' : 'Copy as Markdown'}
    </button>
</div>

<style>
    .markdown {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0 28px;
        margin-top: clamp(48px, 10vh, 88px);
        color: var(--ink-dim);
    }
    .markdown > :global(*) {
        min-height: 44px;
    }
    button {
        padding: 0;
        border: 0;
        background: none;
        letter-spacing: inherit;
        text-transform: inherit;
        cursor: pointer;
        transition: color 140ms ease;
    }
    button:hover {
        color: var(--accent);
    }
</style>
