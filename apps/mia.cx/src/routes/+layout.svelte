<script lang="ts">
    import '../app.css';
    import { onMount, type Snippet } from 'svelte';
    import { page } from '$app/state';
    import ShaderCanvas from '@mia-cx/atmosphere/ShaderCanvas.svelte';
    import Header from '$lib/components/Header.svelte';
    import Footer from '$lib/components/Footer.svelte';
    import { site } from '$lib/content/site';

    let { children }: { children: Snippet } = $props();

    /** Only the home page has a hero for the header's blur to key off. */
    const hasHero = $derived(page.url.pathname === '/');
    /** The share card at /og is just the field and its own text: no header, footer or page chrome. */
    const bare = $derived(page.url.pathname === '/og');

    /*
     * First load only: the page stays hidden while the shader compiles, then everything enters
     * together. `data-boot` on <html> drives it all from CSS; it is set before paint in app.html
     * and cleared once the entrance has played, so later navigations do not animate.
     */
    const ENTRANCE_MS = 1800;
    // Only a stalled GPU reaches this; failure reveals at once through onsettle.
    const MAX_WAIT_MS = 12000;
    function reveal() {
        const root = document.documentElement;
        if (root.dataset.boot !== 'loading') return;
        root.dataset.boot = 'entering';
        setTimeout(() => {
            if (root.dataset.boot === 'entering') delete root.dataset.boot;
        }, ENTRANCE_MS);
    }
    onMount(() => {
        // Tells the shell's own failsafe in app.html that the app is running and owns the reveal.
        document.documentElement.dataset.hydrated = '';
        const timer = setTimeout(reveal, MAX_WAIT_MS);
        return () => clearTimeout(timer);
    });
</script>

<!--
    Link previews. Without an image of its own, a preview picks the largest picture on the page,
    which is the portrait; static/og.jpg is rendered by scripts/share-card.ts instead.
-->
<svelte:head>
    <meta property="og:site_name" content={site.domain} />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="{site.url}{page.url.pathname}" />
    <meta property="og:image" content="{site.url}/og.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="{site.name}, over a purple and pink field of light" />
    <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<!-- Full strength behind the hero and on the share card; half behind reading pages. -->
<ShaderCanvas dims={hasHero} opacity={hasHero || bare ? 1 : 0.5} onsettle={reveal} />

<div class="boot" aria-hidden="true"><span></span></div>

{#if bare}
    {@render children()}
{:else}
    <Header {hasHero} />

    <div class="page">
        {@render children()}
    </div>

    <Footer />
{/if}

<style>
    .page {
        /*
         * No z-index: that would make the page one stacking context, trapping everything in it
         * below the shader. The hero's portrait overlay has to rise above the field, and the +N
         * menu's own z-index already keeps it above the footer from the root.
         */
        position: relative;
        min-height: 60svh;
    }
</style>
