<script lang="ts">
    import '$lib/styles/prose.css';
    import Mentions from '$lib/components/Mentions.svelte';
    import { formatDate } from '$lib/content/vault';
    import { site } from '$lib/content/site';

    let { data } = $props();
    const post = $derived(data.post);
    const formatted = (iso: string) => formatDate(iso, 'long');
</script>

<svelte:head>
    <title>{post.title} — {site.domain}</title>
    <meta name="description" content={post.summary} />
</svelte:head>

<main class="container">
    <a class="back mono" href="/blog">← Blog</a>

    <article>
        <header>
            <h1>{post.title}</h1>
            <p class="meta mono">
                <time datetime={post.date}>{formatted(post.date)}</time>
                {#if post.updated}<span>Updated {formatted(post.updated)}</span>{/if}
            </p>
        </header>

        <!-- Mia's own markdown, from the vault. -->
        <!-- eslint-disable-next-line svelte/no-at-html-tags -- rendered from the vault, which is authored in this repo -->
        <div class="prose">{@html data.html}</div>

        {#if post.source}
            <p class="source mono">
                Originally posted <a href={post.source} rel="external">here ↗</a>
            </p>
        {/if}

        <Mentions mentions={data.mentions} />
    </article>
</main>

<style>
    main {
        padding-top: calc(var(--header-height) + clamp(20px, 4vh, 40px));
    }
    .back {
        display: inline-block;
        margin-top: 16px;
        color: var(--ink-dim);
        text-decoration: none;
    }
    header {
        margin: clamp(24px, 6vh, 48px) 0 clamp(28px, 5vh, 48px);
    }
    h1 {
        font-size: clamp(32px, 5.6vw, 68px);
        font-weight: 640;
        font-stretch: 74%;
        line-height: 0.95;
        letter-spacing: -0.02em;
    }
    .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 20px;
        margin-top: 18px;
        color: var(--ink-dim);
    }

    .source {
        margin-top: 56px;
        padding-top: 16px;
        border-top: 1px solid var(--panel-line);
        color: var(--ink-dim);
    }
</style>
