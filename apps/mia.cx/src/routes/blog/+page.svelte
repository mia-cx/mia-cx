<script lang="ts">
    import { ArrowLink } from '@mia-cx/ui';
    import { formatDate, posts } from '$lib/content/vault';
    import { SECTIONS } from '$lib/content/sections';
    import { SVARTZ_REPO, site } from '$lib/content/site';
</script>

<svelte:head>
    <title>Blog — {site.domain}</title>
    <meta
        name="description"
        content={SECTIONS.blog.published ? `Writing by ${site.name}.` : `Writing by ${site.name}. Coming soon.`}
    />
</svelte:head>

<main class="container">
    <h1>Blog</h1>

    {#if SECTIONS.blog.published}
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
    {:else}
        <p class="soon">
            Coming soon, once
            <ArrowLink class="svartz" href={SVARTZ_REPO}>Svartz</ArrowLink>
            is ready to publish it.
        </p>
    {/if}
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
    .soon {
        max-width: 46ch;
        font-size: clamp(17px, 1.5vw, 20px);
        line-height: 1.55;
    }
    .soon :global(.svartz) {
        font-weight: 600;
    }
    ul {
        display: grid;
    }
    li {
        border-top: 1px solid var(--panel-line);
    }
    a {
        display: grid;
        justify-items: start;
        gap: 8px;
        padding: 24px 0;
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
