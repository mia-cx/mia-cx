<script lang="ts">
    import IconArrowUpRight from '~icons/lucide/arrow-up-right';
    import { SVARTZ_REPO, site } from '$lib/content/site';
</script>

<svelte:head>
    <title>Blog — {site.domain}</title>
    <meta name="description" content="Writing by {site.name}. Coming soon." />
</svelte:head>

<main class="container">
    <h1>Blog</h1>
    <p>
        Coming soon, once
        <a href={SVARTZ_REPO} rel="external">Svartz<IconArrowUpRight class="arrow" /></a>
        is ready to publish it.
    </p>
</main>

<style>
    main {
        padding-top: calc(var(--header-height) + clamp(28px, 7vh, 72px));
        padding-bottom: clamp(64px, 16vh, 160px);
    }
    h1 {
        margin: clamp(24px, 6vh, 56px) 0 24px;
        font-size: clamp(40px, 7.5vw, 96px);
        font-weight: 640;
        font-stretch: 72%;
        line-height: 0.9;
        letter-spacing: -0.025em;
    }
    p {
        max-width: 46ch;
        font-size: clamp(17px, 1.5vw, 20px);
        line-height: 1.55;
    }
    a {
        display: inline-flex;
        align-items: flex-start;
        font-weight: 600;
        text-decoration: none;
    }
    a:hover {
        color: var(--accent);
    }
    a :global(.arrow) {
        color: var(--ink-dim);
        font-size: 0.9em;
        margin-left: 1px;
        margin-top: -0.1em;
    }
    a:hover :global(.arrow) {
        color: inherit;
    }
</style>
