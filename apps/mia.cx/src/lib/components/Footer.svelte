<script lang="ts">
    import { contact, otherSocials, primarySocials, site, sitemap } from '$lib/content/site';
    import { ArrowLink, Socials } from '@mia-cx/ui';
    import IconMail from '~icons/lucide/mail';

    const year = new Date().getFullYear();
</script>

<footer>
    <div class="inner container">
        <section class="brand">
            <h2>{site.domain}</h2>
            <ArrowLink class="contribute" href="https://github.com/mia-cx/mia-cx">Contribute to this website</ArrowLink>
            <div class="reach">
                <Socials featured={primarySocials} more={otherSocials} />
                <ArrowLink class="email" href="mailto:{contact.email}">
                    <IconMail class="mail" />
                    <span>{contact.email}</span>
                </ArrowLink>
            </div>
            <p class="copyright">© {year} {site.domain}</p>
        </section>

        <nav aria-labelledby="sitemap">
            <h2 id="sitemap">Sitemap</h2>
            <ul>
                {#each sitemap as item (item.href)}
                    <li>
                        <ArrowLink href={item.href}>{item.label}</ArrowLink>
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
    .brand :global(.contribute) {
        font-weight: 620;
    }
    .reach {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px 28px;
        margin-top: 26px;
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
    /* The email keeps its envelope on the baseline while its ↗ marker sits at cap height. */
    .reach :global(.email) {
        align-items: center;
    }
    .reach :global(.email .label) {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }
    .reach :global(.email .arrow) {
        align-self: flex-start;
    }
    .email :global(.mail) {
        font-size: 20px;
    }

    @media (max-width: 620px) {
        .inner {
            grid-template-columns: 1fr;
        }
    }
</style>
