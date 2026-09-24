<script lang="ts">
    import { ArrowLink } from '@mia-cx/ui';
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
        <ArrowLink class="svartz" href={SVARTZ_REPO}>Svartz</ArrowLink>
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
    p :global(.svartz) {
        font-weight: 600;
    }
</style>
