<script lang="ts">
    /**
     * One button, three states underneath: system, or an explicit light/dark override.
     *
     * A click always flips to the opposite of what is showing. If that opposite happens to be what
     * the system prefers, the override is dropped rather than stored, so the site goes back to
     * following the system. Overriding to the system's own preference is never a state.
     */
    import { onMount } from 'svelte';
    import IconSun from '~icons/lucide/sun';
    import IconMoon from '~icons/lucide/moon';

    type Theme = 'light' | 'dark';

    let system = $state<Theme>('dark');
    let override = $state<Theme | null>(null);
    const effective = $derived(override ?? system);
    const next = $derived<Theme>(effective === 'dark' ? 'light' : 'dark');
    const nextIsSystem = $derived(next === system);

    onMount(() => {
        const media = matchMedia('(prefers-color-scheme: light)');
        const read = () => (system = media.matches ? 'light' : 'dark');
        read();
        media.addEventListener('change', read);
        const stored = document.documentElement.dataset.theme;
        override = stored === 'light' || stored === 'dark' ? stored : null;
        return () => media.removeEventListener('change', read);
    });

    function toggle() {
        override = nextIsSystem ? null : next;
        if (override) document.documentElement.dataset.theme = override;
        else delete document.documentElement.dataset.theme;
        try {
            if (override) localStorage.setItem('theme', override);
            else localStorage.removeItem('theme');
        } catch {
            /* private mode; the choice just does not persist */
        }
    }
</script>

<button type="button" onclick={toggle} aria-label={`Switch to ${next} mode${nextIsSystem ? ' (follow system)' : ''}`}>
    {#if effective === 'dark'}<IconSun />{:else}<IconMoon />{/if}
</button>

<style>
    /* Sits in the nav as one more link: no box, same colour as the links, icon at their cap height. */
    button {
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        margin: -6px 0;
        padding: 0;
        border: 0;
        background: none;
        color: inherit;
        font-size: 15px;
        cursor: pointer;
        transition: color 140ms ease;
    }
    button:hover,
    button:focus-visible {
        color: var(--accent);
    }
    button:focus-visible {
        outline: 2px solid var(--violet);
        outline-offset: 2px;
    }
</style>
