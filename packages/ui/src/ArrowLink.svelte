<script lang="ts">
    /**
     * A link that ends in an arrow. Internal links get → which slides on hover; anything with a
     * scheme gets ↗, still, raised to cap height and tucked against the last letter, the way the
     * live mia.cx marks external links. Size follows the link's font size.
     */
    import type { Snippet } from 'svelte';
    import type { HTMLAnchorAttributes } from 'svelte/elements';
    import IconArrowRight from '~icons/lucide/arrow-right';
    import IconArrowUpRight from '~icons/lucide/arrow-up-right';
    import { isExternalHref } from './links';

    let {
        href,
        children,
        class: className = '',
        ...rest
    }: HTMLAnchorAttributes & { href: string; children: Snippet; class?: string } = $props();

    const external = $derived(isExternalHref(href));
</script>

<a {href} class="arrow-link {className}" class:external rel={external ? 'external' : rest.rel} {...rest}>
    <span class="label">{@render children()}</span>
    {#if external}<IconArrowUpRight class="arrow" />{:else}<IconArrowRight class="arrow" />{/if}
</a>

<style>
    a {
        display: inline-flex;
        align-items: center;
        gap: 0.35em;
        text-decoration: none;
    }
    a :global(.arrow) {
        flex: none;
        font-size: 0.9em;
        color: var(--ink-dim);
        transition: color 140ms ease;
    }
    a:hover,
    a:focus-visible {
        color: var(--accent);
    }
    a:hover :global(.arrow),
    a:focus-visible :global(.arrow) {
        color: inherit;
    }
    /* Internal: the arrow slides. */
    a:not(.external) :global(.arrow) {
        transition:
            color 140ms ease,
            transform 160ms ease;
    }
    a:not(.external):hover :global(.arrow) {
        transform: translateX(4px);
    }
    /* External: still, raised, tucked in. */
    a.external {
        align-items: flex-start;
        gap: 0;
    }
    a.external :global(.arrow) {
        margin-left: -0.15em;
        margin-top: -0.1em;
    }
</style>
