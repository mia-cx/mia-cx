<script lang="ts">
    import '$lib/styles/prose.css';
    import { site } from '$lib/content/site';

    let { data } = $props();
    const note = $derived(data.note);
</script>

<svelte:head>
    <title>{note.title} — {site.domain}</title>
    <meta name="description" content={note.summary} />
</svelte:head>

<main class="container">
    <a class="back mono" href="/work">← Work</a>

    <header>
        <h1>{note.title}</h1>
        <p class="summary">{note.summary}</p>
    </header>

    <!-- Mia's own note body, from the vault. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- rendered from the vault, which is authored in this repo -->
    <div class="prose">{@html data.html}</div>

    <dl class="facts mono">
        {#if note.stack.length}
            <dt>Stack</dt>
            <dd>{note.stack.join(' · ')}</dd>
        {/if}
        {#if note.year}
            <dt>Year</dt>
            <dd>{note.year}</dd>
        {/if}
        {#if note.status}
            <dt>Status</dt>
            <dd class="status">{note.status}</dd>
        {/if}
        {#if note.live}
            <dt>Live</dt>
            <dd><a href={note.live} rel="external">{note.live.replace('https://', '')}</a></dd>
        {/if}
        {#if note.source}
            <dt>Source</dt>
            <dd><a href={note.source} rel="external">{note.source.replace('https://github.com/', '')}</a></dd>
        {/if}
    </dl>

    <nav class="siblings mono" aria-label="Other work">
        {#if data.previous}<a href="/work/{data.previous.slug}">← {data.previous.title}</a>{:else}<span></span>{/if}
        {#if data.next}<a class="next" href="/work/{data.next.slug}">{data.next.title} →</a>{/if}
    </nav>
</main>

<style>
    main {
        padding-top: calc(var(--header-height) + clamp(20px, 4vh, 40px));
    }
    .back {
        display: inline-block;
        color: var(--ink-dim);
        text-decoration: none;
    }
    header {
        margin: clamp(24px, 6vh, 48px) 0 clamp(28px, 5vh, 48px);
    }
    h1 {
        font-size: clamp(36px, 6.6vw, 84px);
        font-weight: 660;
        font-stretch: 70%;
        line-height: 0.9;
        letter-spacing: -0.035em;
    }
    .summary {
        margin-top: 16px;
        font-size: clamp(18px, 2vw, 22px);
        font-weight: 480;
        line-height: 1.35;
    }
    .facts {
        display: grid;
        grid-template-columns: max-content minmax(0, 1fr);
        gap: 10px 24px;
        margin-top: clamp(40px, 8vh, 72px);
        padding-top: 20px;
        border-top: 1px solid var(--panel-line);
    }
    .facts dt {
        color: var(--ink-dim);
    }
    .facts dd {
        margin: 0;
    }
    .facts a {
        text-decoration: none;
        overflow-wrap: anywhere;
    }
    .status {
        color: var(--accent);
    }
    .siblings {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        margin-top: clamp(48px, 10vh, 88px);
        padding-top: 16px;
        border-top: 1px solid var(--panel-line);
        color: var(--ink-dim);
    }
    .siblings a {
        text-decoration: none;
    }
    .next {
        margin-left: auto;
        text-align: right;
    }
</style>
