<script lang="ts">
    import portrait480 from '$lib/assets/portrait-480.webp';
    import portrait800 from '$lib/assets/portrait-800.webp';
    import portrait1200 from '$lib/assets/portrait-1200.webp';
    import portrait1600 from '$lib/assets/portrait-1600.webp';
    const portraitSet = `${portrait480} 480w, ${portrait800} 800w, ${portrait1200} 1200w, ${portrait1600} 1600w`;
    import { ArrowLink, Socials } from '@mia-cx/ui';
    import Contact from '$lib/components/Contact.svelte';
    import { intro, otherSocials, primarySocials, site } from '$lib/content/site';
    import { featuredWork } from '$lib/content/vault';

    const featured = featuredWork;
</script>

<svelte:head>
    <title>{site.name} — {site.role}</title>
    <meta name="description" content={site.description} />
</svelte:head>

<main class="container">
    <section data-section="hero" class="hero">
        <div class="identity">
            <div class="words">
                <p class="lead" data-enter style:--enter="1">I'm</p>
                <h1 data-enter style:--enter="2">{site.name}</h1>
                <p class="intro" data-enter style:--enter="3">
                    {intro}
                    <ArrowLink class="more" href="/about">Read more</ArrowLink>
                </p>
                <p class="pronouns mono" data-enter style:--enter="4">{site.pronouns}</p>
            </div>
            <div data-enter style:--enter="5">
                <Socials featured={primarySocials} more={otherSocials} panelId="hero-socials" />
            </div>
        </div>

        <!-- Placed left of the text via grid; kept after it in source so the name reads first. -->
        <div class="portrait" data-enter style:--enter="0">
            <img
                src={portrait800}
                srcset={portraitSet}
                sizes="(max-width: 820px) 100vw, 50vw"
                alt="Portrait of {site.name}"
                width="2105"
                height="3475"
                fetchpriority="high"
            />
        </div>
        <!--
            The same photo again, above the shader, faded out across the neck. The field still washes
            over the shoulders and body, but never over the face. Same box, same source, so the two
            layers line up to the pixel and the browser downloads the image once.
        -->
        <div class="portrait portrait-top" aria-hidden="true" data-enter style:--enter="0">
            <img
                src={portrait800}
                srcset={portraitSet}
                sizes="(max-width: 820px) 100vw, 50vw"
                alt=""
                width="2105"
                height="3475"
            />
            <!-- The field's haze, without its light, so the face sits in the same wash as the rest. -->
            <div class="haze" style:--photo="url({portrait800})"></div>
        </div>
    </section>

    <section class="selected" aria-labelledby="selected" style:--enter="6">
        <h2 id="selected">Featured work</h2>
        <ul>
            {#each featured as item (item.slug)}
                <li>
                    <a
                        href={item.markdown ? `/work/${item.slug}` : (item.live ?? item.source)}
                        rel={item.markdown ? undefined : 'external'}
                    >
                        <span class="title">{item.title}</span>
                        <span class="note">{item.summary}</span>
                        {#if item.stack.length}<span class="mono meta">{item.stack.join(' · ')}</span>{/if}
                    </a>
                </li>
            {/each}
        </ul>
        <ArrowLink class="mono all" href="/work">All work</ArrowLink>
    </section>

    <Contact />
</main>

<style>
    /*
     * The hero is the viewport, split in two: the portrait fills the left half from header to the
     * bottom of the hero so its crop line sits on the fold, and the name sits in the right half.
     * On phones the portrait drops below the text and goes full-bleed to the bottom edge.
     */
    .hero {
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        column-gap: 32px;
        align-items: end;
        min-height: 100svh;
        padding-top: calc(var(--header-height) + 24px);
    }
    .identity {
        grid-column: 2;
        align-self: center;
        display: grid;
        justify-items: start;
    }
    .words {
        position: relative;
        z-index: 1;
        display: grid;
        justify-items: start;
    }
    /* Above the portrait, which is positioned and would otherwise paint over the icons. */
    .identity :global(.socials) {
        position: relative;
        z-index: 1;
    }
    /*
     * The photo is rendered taller than the hero and clipped from the bottom, so the head stays just
     * under the header and the framing lands around the shoulders. The fade lives on the container,
     * not the image, so it always sits at the hero's bottom edge no matter how much is cropped.
     */
    .portrait {
        --zoom: 1.2;
        /* How far the photo is pushed down inside the clip, as a share of the hero height. */
        --drop: 14%;
        /* Where the centre of the photo sits, as a share of the viewport width. The text column
           starts at 50vw, so this is stable at every zoom level and window size. */
        --face: 40vw;
        /* Where the top layer crossfades back to the field, as a share of the photo's height: from
           the top of the collar, just under the chin, to where the shoulders begin. */
        --neck-start: 28%;
        --neck-end: 34%;
        /* Spans the viewport rather than the grid column so the photo is placed in viewport terms. */
        position: absolute;
        top: calc(var(--header-height) + 24px);
        bottom: 0;
        left: calc(50% - 50vw);
        width: 100vw;
        /* Clip the bottom only. */
        overflow: visible clip;
        pointer-events: none;
    }
    .portrait img {
        position: absolute;
        top: var(--drop);
        left: var(--face);
        translate: -50% 0;
        display: block;
        width: auto;
        height: calc(100% * var(--zoom));
        max-width: none;
        object-fit: contain;
        object-position: center top;
        /* Gradient positions are in image height, so the fade ends exactly at the container's bottom. */
        mask-image: linear-gradient(
            to bottom,
            #000 calc((50% - var(--drop)) / var(--zoom)),
            transparent calc((100% - var(--drop)) / var(--zoom))
        );
    }
    /* Above the shader's canvas (z-index 5), below the header (20). */
    .portrait-top {
        z-index: 6;
        /* The container spans the viewport; fade it out before the middle, where the text column
           starts, so on tall screens the clean layer can never sit over the name. A soft edge rather
           than a clip, so no seam shows in the hair when a lobe passes. The face is centred at 40vw. */
        mask-image: linear-gradient(to right, #000 calc(50% - 48px), transparent 50%);
    }
    .portrait-top img {
        mask-image: linear-gradient(to bottom, #000 var(--neck-start), transparent var(--neck-end));
    }
    /*
     * Over the photo, the field reads as a flat purple wash, measured at about 14%: fitting renders
     * with and without the canvas gives out = 0.86 × photo + (31, 19, 32) per channel. The top layer
     * sits above the canvas and would miss it, so it gets the same wash, cut to the photo's outline
     * and the neck fade. It halves as the hero scrolls away, as the field does.
     */
    .haze {
        position: absolute;
        top: var(--drop);
        left: var(--face);
        translate: -50% 0;
        height: calc(100% * var(--zoom));
        aspect-ratio: 2105 / 3475;
        background: rgb(221 138 231);
        /* Without scroll timelines, the field publishes its dim for this; with them, the animation below runs. */
        opacity: calc(0.14 * var(--atmosphere-dim, 1));
        mask-image: var(--photo), linear-gradient(to bottom, #000 var(--neck-start), transparent var(--neck-end));
        mask-size: 100% 100%;
        mask-composite: intersect;
        transition: opacity 600ms ease;
    }
    /* Nothing below is washed until the field is up, or ever, without graphics. */
    :global(html:not(:has(canvas.ready))) .haze {
        opacity: 0;
    }
    @supports (view-timeline: --hero) and (animation-timeline: --hero) and (timeline-scope: --hero) {
        @keyframes haze-dim {
            from {
                opacity: 0.14;
            }
            to {
                opacity: 0.07;
            }
        }
        :global(html:has(canvas.ready)) .haze {
            animation: haze-dim linear both;
            animation-timeline: --hero;
            animation-range: exit-crossing 0% exit-crossing 90%;
        }
    }
    .lead {
        color: var(--ink-dim);
        font-size: clamp(18px, 1.8vw, 24px);
    }
    h1 {
        margin-top: 4px;
        font-size: clamp(44px, 5.6vw, 92px);
        font-weight: 660;
        font-stretch: 70%;
        line-height: 0.9;
        letter-spacing: -0.035em;
        text-wrap: balance;
    }
    .intro {
        margin-top: 18px;
        max-width: 46ch;
        font-size: clamp(16px, 1.4vw, 19px);
        line-height: 1.55;
    }
    .intro :global(.more) {
        font-weight: 600;
        color: var(--ink);
        white-space: nowrap;
    }
    .intro :global(.more .arrow) {
        color: inherit;
    }
    .pronouns {
        margin-top: 18px;
        color: var(--ink-dim);
    }
    .identity :global(.socials) {
        margin-top: 26px;
    }

    section[id] {
        /* Anchored from the nav, so keep the fixed header off the heading. */
        scroll-margin-top: calc(var(--header-height) + 16px);
    }
    .selected {
        padding: clamp(40px, 8vh, 80px) 0 clamp(40px, 9vh, 96px);
        border-bottom: 1px solid var(--panel-line);
    }
    .selected h2 {
        margin-bottom: 18px;
        font-size: clamp(26px, 3vw, 40px);
        font-weight: 660;
        font-stretch: 70%;
        line-height: 1;
        letter-spacing: -0.03em;
    }
    .selected :global(.all) {
        margin-top: 20px;
        color: var(--ink-dim);
    }
    .selected ul {
        display: grid;
    }
    .selected li {
        border-top: 1px solid var(--panel-line);
    }
    .selected li:last-child {
        border-bottom: 1px solid var(--panel-line);
    }
    .selected li a {
        display: grid;
        justify-items: start;
        gap: 6px;
        padding: 20px 0;
        text-decoration: none;
    }
    .selected li a:hover .title,
    .selected a:focus-visible .title {
        color: var(--accent);
    }
    .title {
        font-size: clamp(22px, 2.4vw, 32px);
        font-weight: 620;
        font-stretch: 74%;
        line-height: 1;
        letter-spacing: -0.02em;
    }
    .note {
        color: var(--ink);
        font-size: 15px;
    }
    .meta {
        align-self: end;
        color: var(--ink-dim);
    }

    @media (max-width: 820px) {
        /* The portrait sits below the text here, full-bleed, so nothing needs clipping. */
        .portrait-top {
            mask-image: none;
        }
        .hero {
            grid-template-columns: 1fr;
            grid-template-rows: 1fr auto;
            column-gap: 0;
            align-items: stretch;
            padding-bottom: 0;
        }
        .identity {
            grid-column: 1;
            grid-row: 1;
            align-self: center;
            padding-bottom: 24px;
        }
        /* Full-bleed and flush with the bottom of the hero; the crop line sits on the page edge. */
        .portrait {
            --zoom: 1;
            --drop: 0%;
            position: relative;
            top: auto;
            bottom: auto;
            left: auto;
            grid-column: 1;
            grid-row: 2;
            height: auto;
            width: 100vw;
            margin-left: calc(50% - 50vw);
        }
        .portrait img {
            position: static;
            translate: none;
            width: 100%;
            height: auto;
        }
        .haze {
            top: 0;
            left: 0;
            translate: none;
            width: 100%;
            height: auto;
        }
    }
</style>
