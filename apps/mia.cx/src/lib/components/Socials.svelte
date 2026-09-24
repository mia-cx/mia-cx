<script lang="ts">
    /**
     * Primary icons plus a square +N button opening a panel with the rest. The panel is absolutely
     * positioned so it never reflows the row, and closes on Escape, outside click, or blur out.
     */
    import { otherSocials, primarySocials } from '$lib/content/site';
    import SocialIcon from './SocialIcon.svelte';

    let { panelId = 'more-socials' }: { panelId?: string } = $props();

    let open = $state(false);
    let wrapper: HTMLDivElement;
    let trigger: HTMLButtonElement;

    // Anything without a link yet is left out rather than shown as a dead control.
    const primary = primarySocials.filter((social) => social.href);
    const rest = otherSocials.filter((social) => social.href);

    function close(refocus = false) {
        open = false;
        if (refocus) trigger?.focus();
    }
</script>

<svelte:window
    onkeydown={(event) => {
        if (event.key === 'Escape' && open) close(true);
    }}
    onpointerdown={(event) => {
        if (open && wrapper && !wrapper.contains(event.target as Node)) close();
    }}
/>

<div class="socials">
    <ul>
        {#each primary as social}
            <li>
                <a href={social.href} rel="external" aria-label={social.label} title={social.label}>
                    <SocialIcon id={social.id} />
                </a>
            </li>
        {/each}
    </ul>

    <div class="more" bind:this={wrapper}>
        <button
            bind:this={trigger}
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onclick={() => (open = !open)}>
            <span aria-hidden="true">+{rest.length}</span>
            <span class="visually-hidden">{open ? 'Hide' : 'Show'} {rest.length} more links</span>
        </button>

        <div id={panelId} class="panel" hidden={!open}>
            <ul>
                {#each rest as social}
                    <li>
                        <a href={social.href} rel="external">
                            <SocialIcon id={social.id} />
                            <span>{social.label}</span>
                        </a>
                    </li>
                {/each}
            </ul>
        </div>
    </div>
</div>

<style>
    .socials {
        position: relative;
        display: flex;
        align-items: center;
        gap: 14px;
    }
    ul {
        display: flex;
        gap: 6px;
    }
    /* Plain icons: the box is only a hit target, so it keeps its size without a border. */
    .socials > ul a {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        color: var(--ink);
        font-size: 19px;
        transition: color 140ms ease;
    }
    button {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border: 1px solid var(--panel-line);
        background: var(--control);
        color: var(--ink);
        font: inherit;
        font-size: 17px;
        cursor: pointer;
        transition:
            border-color 140ms ease,
            color 140ms ease;
    }
    .socials > ul a:hover,
    .socials > ul a:focus-visible {
        color: var(--accent);
    }
    button:hover,
    button[aria-expanded='true'] {
        border-color: var(--accent);
        color: var(--accent);
    }
    button span[aria-hidden='true'] {
        font-family: var(--font-mono);
        font-size: 12px;
        letter-spacing: 0.02em;
    }

    .panel {
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        z-index: 30;
        width: max-content;
        min-width: 190px;
        padding: 6px;
        border: 1px solid var(--panel-line);
        background: var(--panel);
        box-shadow: 0 18px 50px -20px var(--menu-shadow);
    }
    .panel[hidden] {
        display: none;
    }
    .panel ul {
        display: grid;
        gap: 0;
    }
    .panel a {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        color: var(--ink);
        font-size: 15px;
        text-decoration: none;
    }
    .panel a:hover,
    .panel a:focus-visible {
        background: var(--menu-hover);
        color: var(--accent);
    }
</style>
