<script lang="ts">
    import type { Snippet } from 'svelte';
    import { page } from '$app/state';
    import { site } from '$lib/content/site';
    import '$lib/styles/prose.css';

    let { title, description, children }: { title: string; description: string; children: Snippet } = $props();
</script>

<svelte:head>
    <title>Textile {title.toLowerCase()} | {site.domain}</title>
    <meta property="og:title" content="Textile {title.toLowerCase()} | {site.domain}" />
    <meta name="description" content={description} />
</svelte:head>

<main class="container">
    <article>
        <h1>Textile {title.toLowerCase()}</h1>
        <p class="effective">Effective <time datetime="2026-10-19">19 October 2026</time></p>
        <nav aria-label="Textile policies">
            <a href="/textile/terms" aria-current={page.url.pathname === '/textile/terms' ? 'page' : undefined}>
                Terms of service
            </a>
            <a href="/textile/privacy" aria-current={page.url.pathname === '/textile/privacy' ? 'page' : undefined}>
                Privacy policy
            </a>
        </nav>
        <div class="prose">
            {@render children()}
        </div>
    </article>
</main>

<style>
    main {
        padding-top: calc(var(--header-height) + clamp(28px, 7vh, 72px));
    }
    article {
        overflow-wrap: anywhere;
    }
    h1 {
        font-size: clamp(38px, 7vw, 72px);
        font-weight: 660;
        font-stretch: 70%;
        line-height: 0.95;
        letter-spacing: -0.035em;
    }
    .effective {
        margin-top: 24px;
    }
    nav {
        display: flex;
        flex-wrap: wrap;
        gap: 0 24px;
        margin: 12px 0 24px;
    }
    nav a {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
    }
    nav a[aria-current='page'] {
        text-decoration-color: currentColor;
    }
</style>
