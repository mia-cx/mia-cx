<script lang="ts">
    import { contact, site, sitemap } from '$lib/content/site';
    import Socials from './Socials.svelte';
    import IconMail from '~icons/lucide/mail';
    import IconArrowRight from '~icons/lucide/arrow-right';
    import IconArrowUpRight from '~icons/lucide/arrow-up-right';

    const year = new Date().getFullYear();
</script>

<footer>
    <div class="inner container">
        <section class="brand">
            <h2>{site.domain}</h2>
            <a class="contribute" href="https://github.com/mia-cx/mia-cx" rel="external">
                Contribute to this website <IconArrowUpRight class="arrow" />
            </a>
            <div class="reach">
                <Socials />
                <a class="email" href="mailto:{contact.email}">
                    <IconMail class="mail" />
                    <span>{contact.email}</span>
                    <IconArrowUpRight class="arrow" />
                </a>
            </div>
            <p class="copyright">© {year} {site.domain}</p>
        </section>

        <nav aria-labelledby="sitemap">
            <h2 id="sitemap">Sitemap</h2>
            <ul>
                {#each sitemap as item (item.href)}
                    <li>
                        <a href={item.href} rel={item.external ? 'external' : undefined}>
                            {item.label}
                            {#if item.external}<IconArrowUpRight class="arrow" />{:else}<IconArrowRight
                                    class="arrow"
                                />{/if}
                        </a>
                    </li>
                {/each}
            </ul>
        </nav>
    </div>
</footer>

<style>
    footer {
        position: relative;
        z-index: 1;
        margin-top: clamp(64px, 14vh, 140px);
        border-top: 1px solid var(--panel-line);
    }
    .inner {
        display: grid;
        grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
        gap: clamp(24px, 4vw, 48px);
        padding: clamp(36px, 6vh, 64px) 0 max(32px, env(safe-area-inset-bottom));
    }
    .brand {
        display: grid;
        justify-items: start;
        gap: 6px;
    }
    .brand h2 {
        font-size: clamp(28px, 3.4vw, 40px);
        font-weight: 640;
        font-stretch: 76%;
        line-height: 1;
        letter-spacing: -0.02em;
    }
    a {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        text-decoration: none;
    }
    a:hover {
        color: var(--accent);
    }
    .contribute {
        font-weight: 620;
    }
    .reach {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px 28px;
        margin-top: 26px;
    }
    .email :global(.mail) {
        font-size: 20px;
    }
    .copyright {
        margin-top: 26px;
        color: var(--ink-dim);
    }

    nav h2 {
        margin-bottom: 8px;
        font-size: clamp(24px, 2.6vw, 30px);
        font-weight: 480;
        font-stretch: 80%;
        color: var(--ink-dim);
    }
    nav ul {
        display: grid;
        gap: 8px;
    }
    :global(footer .arrow) {
        font-size: 0.9em;
        color: var(--ink-dim);
    }
    /* Internal links slide their arrow on hover. */
    a:not([rel='external'], .email) :global(.arrow) {
        transition: transform 160ms ease;
    }
    a:not([rel='external'], .email):hover :global(.arrow) {
        transform: translate(4px, 0);
    }
    /* External marker, as on the live site: small, raised, tucked against the last letter. */
    a[rel='external'],
    .email {
        align-items: flex-start;
    }
    a[rel='external'] :global(.arrow),
    .email :global(.arrow) {
        margin-left: -4px;
        margin-top: -0.1em;
    }
    .email {
        align-items: center;
    }
    .email :global(.arrow) {
        align-self: flex-start;
    }
    a:hover :global(.arrow) {
        color: inherit;
    }

    @media (max-width: 620px) {
        .inner {
            grid-template-columns: 1fr;
        }
    }
</style>
