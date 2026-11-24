<!--
    A post's page, for /blog/<post> and /work/<project>/<post> alike. `back` is where the link
    above it leads: the blog, or the post's project.
-->
<script lang="ts">
    import '$lib/styles/prose.css';
    import Mentions from '$lib/components/Mentions.svelte';
    import PageMarkdown from '$lib/components/PageMarkdown.svelte';
    import NarrationPlayer from '$lib/components/NarrationPlayer.svelte';
    import TableOfContents from '$lib/components/TableOfContents.svelte';
    import { formatDate, type Heading, type Post, type VaultEntry } from '$lib/content/vault';
    import { site } from '$lib/content/site';

    let {
        post,
        html,
        headings,
        mentions,
        back,
    }: {
        post: Post;
        html: string;
        headings: Heading[];
        mentions: (VaultEntry & { href: string })[];
        back: { title: string; href: string };
    } = $props();
    const formatted = (iso: string) => formatDate(iso, 'long');
</script>

<svelte:head>
    <title>{post.title} — {site.domain}</title>
    <meta property="og:title" content="{post.title} — {site.domain}" />
    <meta name="description" content={post.summary} />
</svelte:head>

<main class="container">
    <a class="back mono" href={back.href} data-print-hide>← {back.title}</a>

    <!--
        Narrated when the post's `narration` property is on: the title and body; dates, buttons, the
        source line and mentions stay silent.
    -->
    <article data-narration={post.narration ? '' : undefined}>
        <header>
            <h1>{post.title}</h1>
            <div class="page-actions" data-narration-skip>
                <p class="meta mono">
                    <time datetime={post.date}>{formatted(post.date)}</time>
                    {#if post.updated}<span>Updated {formatted(post.updated)}</span>{/if}
                    {#if post.project}<a href={post.project.href}>{post.project.title}</a>{/if}
                </p>
                <PageMarkdown />
            </div>
        </header>

        <div class="body">
            <aside class="gutter" data-print-hide data-markdown="skip" data-narration-skip>
                <div class="rail">
                    {#if post.narration}<div class="float"><NarrationPlayer /></div>{/if}
                    <TableOfContents {headings} />
                </div>
            </aside>
            <!-- Mia's own markdown, from the vault. -->
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- rendered from the vault, which is authored in this repo -->
            <div class="prose">{@html html}</div>
        </div>

        {#if post.source}
            <p class="source mono" data-narration-skip>
                Originally posted <a href={post.source} rel="external">here ↗</a>
            </p>
        {/if}

        <div data-narration-skip><Mentions {mentions} /></div>
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
    .page-actions {
        column-gap: 20px;
        margin-top: 18px;
    }
    .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 20px;
        color: var(--ink-dim);
        /* Trimmed to cap height and baseline, so the dates centre on the buttons. */
        text-box: trim-both cap alphabetic;
    }
    .meta a {
        color: inherit;
    }
    .float {
        position: fixed;
        bottom: max(24px, env(safe-area-inset-bottom));
        left: var(--gutter);
        z-index: 30;
        background: var(--panel);
    }
    @media (min-width: 1400px) {
        .float {
            position: static;
            background: none;
        }
    }

    /*
     * The left gutter spans the body's height beside it, and its rail of the player and the contents
     * sticks under the header. The gutter fits from here: the content width, two rails and their gaps.
     * The right gutter is kept for comments and reactions.
     */
    .body {
        position: relative;
    }
    @media (min-width: 1400px) {
        .gutter {
            position: absolute;
            top: 0;
            right: calc(100% + 48px);
            bottom: 0;
            width: 200px;
        }
        .rail {
            position: sticky;
            top: calc(var(--header-height) + 24px);
            display: flex;
            flex-direction: column;
            gap: 28px;
            max-height: calc(100dvh - var(--header-height) - 48px);
        }
    }

    .source {
        margin-top: 56px;
        padding-top: 16px;
        border-top: 1px solid var(--panel-line);
        color: var(--ink-dim);
    }
</style>
