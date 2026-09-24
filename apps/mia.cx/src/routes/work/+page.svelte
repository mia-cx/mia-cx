<script lang="ts">
    import { ArrowLink } from '@mia-cx/ui';
    import { listedWork } from '$lib/content/vault';
    import { SVARTZ_REPO, site } from '$lib/content/site';
</script>

<svelte:head>
    <title>Work — {site.domain}</title>
    <meta name="description" content="Code, audio and visual work by {site.name}." />
</svelte:head>

<main class="container">
    <header>
        <h1>Work</h1>
    </header>

    <ul class="grid">
        {#each listedWork as item (item.slug)}
            <li>
                <svelte:element
                    this={item.markdown || item.live || item.source ? 'a' : 'div'}
                    href={item.markdown ? `/work/${item.slug}` : (item.live ?? item.source)}
                    rel={!item.markdown && (item.live || item.source) ? 'external' : undefined}
                >
                    <span class="title">{item.title}</span>
                    <span class="note">{item.summary}</span>
                    <span class="meta mono">
                        {#if item.stack.length}<span>{item.stack.join(' · ')}</span>{/if}
                        {#if item.year}<span>{item.year}</span>{/if}
                        {#if item.status}<span class="status">{item.status}</span>{/if}
                    </span>
                </svelte:element>
            </li>
        {/each}
    </ul>

    <p class="more">
        More projects and details are coming soon, once
        <ArrowLink class="svartz" href={SVARTZ_REPO}>Svartz</ArrowLink>
        is ready to publish them.
    </p>
</main>

<style>
    main {
        padding-top: calc(var(--header-height) + clamp(28px, 7vh, 72px));
    }
    header {
        display: flex;
        flex-wrap: wrap;
        align-items: end;
        justify-content: space-between;
        gap: 20px;
        padding-bottom: 18px;
    }
    h1 {
        font-size: clamp(38px, 7vw, 92px);
        font-weight: 660;
        font-stretch: 70%;
        line-height: 0.9;
        letter-spacing: -0.035em;
    }

    .grid {
        display: grid;
    }
    .grid > li {
        border-top: 1px solid var(--panel-line);
    }
    .grid > li:last-child {
        border-bottom: 1px solid var(--panel-line);
    }
    .grid > li > :global(*) {
        display: grid;
        justify-items: start;
        gap: 6px;
        padding: 20px 0;
        text-decoration: none;
    }
    .grid > li > :global(a:hover .title),
    .grid > li > :global(a:focus-visible .title) {
        color: var(--accent);
    }
    .status {
        color: var(--accent);
    }
    .title {
        font-size: clamp(21px, 2.2vw, 30px);
        font-weight: 620;
        font-stretch: 74%;
        line-height: 1.02;
        letter-spacing: -0.02em;
        overflow-wrap: anywhere;
    }
    .note {
        color: var(--ink);
        font-size: 15px;
    }
    .meta {
        display: flex;
        flex-wrap: wrap;
        align-self: end;
        gap: 4px 14px;
        padding-top: 6px;
        color: var(--ink-dim);
    }

    .more {
        max-width: 46ch;
        padding: 28px 0 clamp(48px, 10vh, 96px);
        color: var(--ink-dim);
    }
    .more :global(.svartz) {
        color: var(--ink);
        font-weight: 600;
    }
</style>
