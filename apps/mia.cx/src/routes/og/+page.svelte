<script lang="ts">
    /**
     * The link-preview card, laid out at 1200×630 over the live field. Not linked from anywhere;
     * scripts/share-card.ts screenshots it into static/og.jpg.
     */
    import { site } from '$lib/content/site';
</script>

<svelte:head>
    <title>{site.name} — share card</title>
    <meta name="robots" content="noindex" />
</svelte:head>

<main>
    <p class="domain mono">{site.domain}</p>
    <div class="words">
        <p class="lead">I'm</p>
        <h1>{site.name}</h1>
        <p class="role">Designer, creative developer and music producer</p>
    </div>
</main>

<style>
    main {
        /* No z-index: the field passes over the name, as it does on the site. */
        display: grid;
        grid-template-rows: auto 1fr;
        width: 1200px;
        height: 630px;
        padding: 48px 96px;
    }
    .domain {
        color: var(--ink-dim);
        font-size: 20px;
    }
    .words {
        align-self: center;
        display: grid;
        justify-items: start;
    }
    .lead {
        color: var(--ink-dim);
        font-size: 34px;
    }
    h1 {
        margin-top: 6px;
        font-size: 132px;
        font-weight: 660;
        font-stretch: 70%;
        line-height: 0.9;
        letter-spacing: -0.035em;
    }
    .role {
        margin-top: 26px;
        color: var(--ink-dim);
        font-size: 30px;
    }
</style>
