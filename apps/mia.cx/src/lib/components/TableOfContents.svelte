<!--
    A post's sections, for the left gutter beside its body: its h2 and h3 headings, with the one being
    read marked. Only shown where the gutter fits it, and never printed. In a column too short for it,
    the list scrolls.
-->
<script lang="ts">
    import type { Heading } from '$lib/content/vault';

    let { headings }: { headings: Heading[] } = $props();

    const sections = $derived(headings.filter(({ depth }) => depth === 2 || depth === 3));
    /** A heading counts as being read once it passes this far down the viewport. */
    const READING_LINE = 0.3;
    let current = $state<string>();

    $effect(() => {
        const targets = sections.map(({ id }) => document.getElementById(id)).filter((el) => el !== null);
        const update = () => {
            const line = innerHeight * READING_LINE;
            current = targets.findLast((el) => el.getBoundingClientRect().top <= line)?.id;
        };
        update();
        addEventListener('scroll', update, { passive: true });
        return () => removeEventListener('scroll', update);
    });

    // A list taller than the viewport scrolls itself to keep the current section in sight, again
    // whenever the window resizes. Only the list moves: scrollIntoView would scroll the page too.
    let list = $state<HTMLOListElement>();
    let viewport = $state(0);
    $effect(() => {
        const link = current && viewport && list?.querySelector<HTMLElement>('[aria-current]');
        if (!list || !link) return;
        const bottom = link.offsetTop + link.offsetHeight - list.clientHeight;
        list.scrollTop = Math.min(Math.max(list.scrollTop, bottom), link.offsetTop);
    });
</script>

<svelte:window bind:innerHeight={viewport} />

{#if sections.length > 1}
    <nav aria-label="Contents" data-print-hide data-markdown="skip" data-narration-skip>
        <ol bind:this={list}>
            {#each sections as { id, label, depth } (id)}
                <li class:sub={depth === 3}>
                    <a href="#{id}" aria-current={id === current ? 'location' : undefined}>
                        <!-- eslint-disable-next-line svelte/no-at-html-tags -- a heading from the vault, tags stripped -->
                        {@html label}
                    </a>
                </li>
            {/each}
        </ol>
    </nav>
{/if}

<style>
    nav {
        display: none;
    }
    /* Where the post's gutter shows. */
    @media (min-width: 1400px) {
        nav {
            display: flex;
            flex-direction: column;
            min-height: 0;
        }
    }
    ol {
        min-height: 0;
        overflow-y: auto;
        font-size: 14px;
        line-height: 1.35;
    }
    li {
        margin: 0;
    }
    /* Each link draws its own piece of the rule, so the scrolling list can't clip the marked one. */
    a {
        display: block;
        padding: 5px 0 5px 14px;
        border-left: 1px solid var(--ink-faint);
        color: var(--ink-dim);
        text-decoration: none;
    }
    .sub a {
        padding-left: 28px;
    }
    a:hover {
        color: var(--ink);
    }
    a[aria-current] {
        border-left-color: var(--accent);
        color: var(--ink);
    }
</style>
