<script lang="ts">
    import '../app.css';
    import { onMount, type Snippet } from 'svelte';
    import { page } from '$app/stores';
    import ShaderCanvas from '$lib/shader/ShaderCanvas.svelte';
    import Header from '$lib/components/Header.svelte';
    import Footer from '$lib/components/Footer.svelte';

    let { children }: { children: Snippet } = $props();

    /** Only the home page has a hero for the header's blur to key off. */
    const hasHero = $derived($page.url.pathname === '/');

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
        const timer = setTimeout(reveal, MAX_WAIT_MS);
        return () => clearTimeout(timer);
    });
</script>

<ShaderCanvas dims={hasHero} opacity={hasHero ? 1 : 0.5} onsettle={reveal} />

<div class="boot" aria-hidden="true"><span></span></div>

<Header {hasHero} />

<div class="page">
    {@render children()}
</div>

<Footer />

<style>
    .page {
        position: relative;
        /* Contact menus can extend over the footer without sitting behind its text. */
        z-index: 2;
        min-height: 60svh;
    }
</style>
