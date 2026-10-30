<script lang="ts">
    import '../app.css';
    import type { Snippet } from 'svelte';
    import { page } from '$app/state';
    import ShaderCanvas from '@mia-cx/atmosphere/ShaderCanvas.svelte';
    import { PrintSwitch } from '@mia-cx/print';
    import Appendix from '$lib/cv/Appendix.svelte';
    import ArticlePaper from '$lib/cv/ArticlePaper.svelte';
    import CV from '$lib/cv/CV.svelte';
    import Header from '$lib/components/Header.svelte';
    import Footer from '$lib/components/Footer.svelte';
    import PageMarkdown from '$lib/components/PageMarkdown.svelte';
    import { site } from '$lib/content/site';

    let { children }: { children: Snippet } = $props();

    /** Only the home page has a hero for the header's blur to key off. */
    const hasHero = $derived(page.url.pathname === '/');
    /** The bake page for the printed field draws its own fields, one per sheet, and nothing else. */
    const stills = $derived(page.url.pathname === '/cv-stills');
    /** The share card at /og is just the field and its own text: no header, footer or page chrome. */
    const bare = $derived(page.url.pathname === '/og' || stills);

    /*
     * First load of the home page only: it stays hidden while the shader compiles, then everything enters
     * together. `data-boot` on <html> drives it all from CSS; it is set before paint in app.html
     * and cleared once the entrance has played, so later navigations do not animate. A GPU still
     * compiling at 2.5 s is not waited for: app.html reveals the page itself.
     */
    const ENTRANCE_MS = 1800;
    function reveal() {
        const root = document.documentElement;
        if (root.dataset.boot !== 'loading') return;
        root.dataset.boot = 'entering';
        setTimeout(() => {
            if (root.dataset.boot === 'entering') delete root.dataset.boot;
        }, ENTRANCE_MS);
    }
</script>

<!--
    Link previews. Without an image of its own, a preview picks the largest picture on the page,
    which is the portrait; static/og.jpg is rendered by scripts/share-card.ts instead.
-->
<svelte:head>
    <meta property="og:site_name" content={site.domain} />
    <meta property="og:type" content="website" />
    <!-- A role link keeps its role: crawlers that re-read og:url would otherwise show the plain CV. -->
    <meta property="og:url" content="{site.url}{page.url.pathname}{page.data.role ? `?role=${page.data.role}` : ''}" />
    <meta property="og:image" content="{site.url}/og.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="{site.name}, over a purple and pink field of light" />
    <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<!-- Full strength behind the hero and on the share card; half behind reading pages. -->
{#if !stills}
    <!-- /cv's sheets carry their own field, so the site's stays behind them there. -->
    <ShaderCanvas
        class="field"
        dims={hasHero}
        opacity={hasHero || bare ? 1 : 0.5}
        layer={page.url.pathname === '/cv' ? 'back' : 'front'}
        onsettle={reveal}
    />
{/if}

<div class="boot" aria-hidden="true"><span></span></div>

{#if bare}
    {@render children()}
{:else}
    <Header {hasHero} />

    <div class="page">
        {@render children()}
    </div>

    {#if !page.error}<PageMarkdown />{/if}

    <Footer />
{/if}

<!--
    Printing any page but an Article gives the CV; an Article prints itself on the CV's ink field.
    Outside <main>, so Markdown twins never carry it.
-->
<PrintSwitch article={page.data.article === true}>
    <CV cv={page.data.cv} theme={page.data.theme} />
    {#if page.data.appendix}<Appendix appendix={page.data.appendix} />{/if}
    {#snippet paper()}<ArticlePaper />{/snippet}
</PrintSwitch>

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
    /*
     * Nearest to the mouse camera in app.css, at the depth the home page gives it (four steps), and
     * grown past the edges by that much so the shift never shows one. The drift settles as the hero
     * scrolls away, over the same range as the field's dim, so the field holds still over the rest
     * of the page. Where scroll timelines exist, `--field-drift` runs on the root, since the canvas's
     * own animation is the dim; elsewhere the dim's published value, 1 to 0.5, stands in.
     */
    @property --field-drift {
        syntax: '<number>';
        inherits: true;
        initial-value: 1;
    }
    :global(canvas.field) {
        --atmosphere-bleed: 28px;
        --reach: calc(var(--field-depth, 0) * var(--field-drift) * (2 * var(--atmosphere-dim, 1) - 1));
        transform: translate(calc(var(--pan-step-x, 0px) * var(--reach)), calc(var(--pan-step-y, 0px) * var(--reach)));
    }
    @supports (view-timeline: --hero) and (animation-timeline: --hero) and (timeline-scope: --hero) {
        @keyframes field-settle {
            from {
                --field-drift: 1;
            }
            to {
                --field-drift: 0;
            }
        }
        :global(:root:has([data-section='hero'])) {
            animation: field-settle linear both;
            animation-timeline: --hero;
            animation-range: exit-crossing 0% exit-crossing 90%;
        }
    }
</style>
