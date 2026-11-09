<script lang="ts">
    import { formatDate, posts } from '$lib/content/vault';
    import { site } from '$lib/content/site';
</script>

<svelte:head>
    <title>Blog — {site.domain}</title>
    <meta property="og:title" content="Blog — {site.domain}" />
    <meta name="description" content="Writing by {site.name}." />
</svelte:head>

<main class="container">
    <h1>Blog</h1>

    <ul>
        {#each posts as post (post.slug)}
            <li>
                <a href={post.external ?? `/blog/${post.slug}`} rel={post.external ? 'external' : undefined}>
                    <span class="title"
                        >{post.title}{#if post.external}<span class="away"> ↗</span>{/if}</span
                    >
                    <span class="summary">{post.summary}</span>
                    <span class="meta mono">
                        <time datetime={post.date}>{formatDate(post.date)}</time>
                        {#if post.external}<span>{new URL(post.external).hostname.replace('www.', '')}</span>{/if}
                    </span>
                </a>
            </li>
        {/each}
    </ul>
</main>

<style>
    main {
        padding-top: calc(var(--header-height) + clamp(28px, 7vh, 72px));
        padding-bottom: clamp(64px, 16vh, 160px);
    }
    h1 {
        margin: clamp(24px, 6vh, 56px) 0 clamp(24px, 5vh, 48px);
        font-size: clamp(40px, 7.5vw, 96px);
        font-weight: 640;
        font-stretch: 72%;
        line-height: 0.9;
        letter-spacing: -0.025em;
    }
    ul {
        display: grid;
    }
    li {
        padding: 24px 0;
    }
    /* Only the text is the link, not the row around it. */
    a {
        display: grid;
        justify-items: start;
        gap: 8px;
        width: fit-content;
        text-decoration: none;
    }
    a:hover .title,
    a:focus-visible .title {
        color: var(--accent);
    }
    .title {
        font-size: clamp(24px, 3.4vw, 38px);
        font-weight: 600;
        font-stretch: 78%;
        line-height: 1.05;
        letter-spacing: -0.015em;
    }
    .away {
        color: var(--ink-dim);
        font-size: 0.6em;
    }
    .summary {
        color: var(--ink);
    }
    .meta {
        display: flex;
        gap: 16px;
        color: var(--ink-dim);
    }
</style>
