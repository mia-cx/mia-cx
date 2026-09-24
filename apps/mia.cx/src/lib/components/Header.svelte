<script lang="ts">
    /**
     * Sticky header, ported from mia-cx/maal with square corners.
     *
     * The blur and tint layers are anchored to the header but their bottom edge animates far past it,
     * so as the hero leaves they spill down the viewport and then settle. That runs off the hero's
     * own view timeline where the browser supports it, and off a scroll listener where it does not.
     */
    import { page } from '$app/state';
    import { EasedGradient, GradientBlur, ThemeToggle } from '@mia-cx/ui';
    import { nav, site } from '$lib/content/site';

    let { hasHero = false }: { hasHero?: boolean } = $props();

    let header: HTMLElement;
    let heroVisible = $state(!hasHero ? false : true);
    let heroExit = $state(hasHero ? 0 : 1);
    $effect(() => {
        heroVisible = hasHero;
        heroExit = hasHero ? 0 : 1;
    });

    const INITIAL = -60;
    const PEAK = -500;
    const SETTLED = -150;

    const bottomFor = (progress: number) => {
        if (progress <= 0) return INITIAL;
        if (progress < 0.2) return INITIAL + (PEAK - INITIAL) * (progress / 0.2);
        if (progress < 0.9) return PEAK + (SETTLED - PEAK) * ((progress - 0.2) / 0.7);
        return SETTLED;
    };

    const bottom = $derived(`${bottomFor(heroExit)}%`);

    const path = $derived(page.url.pathname);
    const current = (href: string) =>
        href.includes('#') ? undefined : path === href || (href !== '/' && path.startsWith(href)) ? 'page' : undefined;
</script>

<svelte:window
    onscroll={() => {
        const hero = document.querySelector<HTMLElement>('[data-section="hero"]');
        if (!hero) {
            heroVisible = false;
            heroExit = 1;
            return;
        }
        const rect = hero.getBoundingClientRect();
        heroVisible = rect.bottom > window.innerHeight * 0.1;
        heroExit = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height * 0.9)));
    }}
/>

<header bind:this={header} data-header data-hero-visible={heroVisible} style:--bottom={bottom}>
    <GradientBlur class="header-layer" blur={12} detail={4} angle="to top" />
    <EasedGradient class="header-layer" from="var(--haze)" to="transparent" angle="to bottom" detail={8} />

    <div class="bar container">
        <a class="wordmark" href="/">{site.domain}</a>
        <nav aria-label="Site">
            {#each nav as item (item.href)}
                <a class="mono" href={item.href} aria-current={current(item.href)}>{item.label}</a>
            {/each}
            <ThemeToggle />
        </nav>
    </div>
</header>

<style>
    header {
        position: fixed;
        inset: 0 0 auto;
        /* Above anything the page lifts into the root stacking context: the portrait overlay (6)
           and the social menus (30) must never paint over the header. */
        z-index: 40;
        display: flex;
        justify-content: center;
        width: 100%;
        /*
         * No `isolation: isolate` and no negative z-index on the layers. Both cut what
         * `backdrop-filter` is allowed to sample: measured against a blur-off baseline, isolation
         * plus `z-index: -20` reduced the blur's contribution to a third of its effect.
         */
    }

    header :global(.header-layer) {
        position: absolute;
        z-index: 0;
        inset: 0 0 var(--bottom) 0;
        pointer-events: none;
        transition: bottom 300ms ease;
    }

    .bar {
        position: relative;
        z-index: 10;
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 24px;
        padding: 18px 0;
        padding-top: max(18px, env(safe-area-inset-top));
    }
    .bar a {
        text-decoration: none;
    }

    /*
     * Nothing on the bar itself: no scrim, no second blur, no rule. The gradient blur and the eased
     * tint carry it, and a hard edge across the field read as a seam.
     */
    .wordmark {
        color: var(--wordmark);
        font-weight: 640;
        font-stretch: 76%;
        font-size: 19px;
        letter-spacing: -0.01em;
    }
    nav {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px clamp(14px, 3vw, 30px);
    }
    nav a[aria-current='page'] {
        color: var(--accent);
    }

    /*
     * maal declares this `inherits: false`, which is fine there because the scroll-timeline animation
     * sets it on the layer elements themselves. Here the layers also need the value the header sets
     * directly — the fallback path, and every page that has no hero to key a timeline off — so it has
     * to inherit.
     */
    @property --bottom {
        syntax: '<length-percentage>';
        initial-value: -60%;
        inherits: true;
    }

    /* Where scroll timelines exist, the hero drives the spill and JS stops mattering. */
    @supports (view-timeline: --hero) and (animation-timeline: --hero) and (timeline-scope: --hero) {
        :global(:root) {
            timeline-scope: --hero;
        }
        :global([data-section='hero']) {
            view-timeline: --hero block;
        }
        @keyframes header-spill {
            0% {
                --bottom: -60%;
            }
            20% {
                --bottom: -500%;
            }
            90%,
            100% {
                --bottom: -150%;
            }
        }
        header[data-hero-visible] :global(.header-layer) {
            animation: header-spill linear both;
            animation-timeline: --hero;
            animation-range: exit 0% 90%;
        }
    }
</style>
