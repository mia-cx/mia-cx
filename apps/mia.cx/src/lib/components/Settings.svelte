<!--
    The header's Settings button and the popover it opens, anchored below it. The native `popover`
    closes on Escape and on a click outside, and hands focus back to the button. Every control writes
    straight to `$lib/settings`, which stores it and applies it to the page.
-->
<script lang="ts">
    import IconSettings from '~icons/lucide/settings';
    import { DOUBLE_CLICKS, WIND_SPEEDS, settings } from '$lib/settings.svelte';

    let open = $state(false);
</script>

<!--
    One option of a choice, as a pressed button rather than a named radio: `<mia-marker>` copies the
    page, radios and all, and a copy sharing a radio's name would uncheck the real one.
-->
{#snippet option<T>(label: string, value: T, current: T, choose: (value: T) => void)}
    <button type="button" aria-pressed={value === current} onclick={() => choose(value)}>{label}</button>
{/snippet}

<button
    type="button"
    class="toggle"
    popovertarget="settings"
    aria-label="Settings"
    aria-expanded={open}
    data-narration-skip
>
    <IconSettings aria-hidden="true" />
</button>

<div
    id="settings"
    class="panel"
    popover="auto"
    role="dialog"
    aria-label="Settings"
    ontoggle={(event) => (open = (event as ToggleEvent).newState === 'open')}
    data-narration-skip
>
    <fieldset class="row">
        <legend>Theme</legend>
        <div class="segments">
            {#each [['light', 'Light'], ['dark', 'Dark']] as const as [theme, label] (theme)}
                {@render option(label, theme, settings.theme.value, (next) => (settings.theme.value = next))}
            {/each}
        </div>
    </fieldset>
    <label class="row">
        Reduced motion
        <input
            type="checkbox"
            role="switch"
            checked={settings.motion.value === 'reduce'}
            onchange={(event) => (settings.motion.value = event.currentTarget.checked ? 'reduce' : 'full')}
        />
    </label>
    <label class="row">Field <input type="checkbox" role="switch" bind:checked={settings.field.value} /></label>

    <h2 class="mono">Narration</h2>
    <label class="row">
        Pause while selecting
        <input type="checkbox" role="switch" bind:checked={settings.pauseWhileSelecting.value} />
    </label>
    <fieldset class="row">
        <legend>Double-click speed</legend>
        <div class="segments">
            {#each Object.entries(DOUBLE_CLICKS) as [label, ms] (ms)}
                {@render option(label, ms, settings.doubleClick.value, (next) => (settings.doubleClick.value = next))}
            {/each}
        </div>
    </fieldset>
    <label class="row">Funny mode <input type="checkbox" role="switch" bind:checked={settings.funny.value} /></label>
    <fieldset class="row" disabled={!settings.funny.value}>
        <legend>Max wind speed</legend>
        <div class="segments">
            {#each WIND_SPEEDS as speed (speed)}
                {@render option(
                    `${speed}×`,
                    speed,
                    settings.windSpeed.value,
                    (next) => (settings.windSpeed.value = next),
                )}
            {/each}
        </div>
    </fieldset>
</div>

<style>
    /* Sits in the nav as one more link: no box, same colour as the links, icon at their cap height. */
    .toggle {
        anchor-name: --settings;
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
    .toggle:hover,
    .toggle:focus-visible,
    .toggle[aria-expanded='true'] {
        color: var(--accent);
    }

    /* Below the button, its right edge on the button's; under the header where anchoring is missing. */
    .panel {
        position-anchor: --settings;
        position-area: bottom span-left;
        position-try-fallbacks: flip-inline;
        inset: auto;
        width: min(340px, 100vw - 32px);
        /* On a short window the panel scrolls rather than running off the bottom. */
        max-height: calc(100dvh - var(--header-height) - 16px);
        overflow: auto;
        margin: 10px 0 0;
        padding: 14px 16px 16px;
        border: 1px solid var(--panel-line);
        background: var(--panel);
        color: var(--ink);
        font-size: 14px;
        box-shadow: 0 18px 40px -18px var(--menu-shadow);
    }
    @supports not (position-area: bottom) {
        .panel {
            top: var(--header-height);
            right: var(--gutter);
            margin: 0;
        }
    }
    .panel:popover-open {
        display: grid;
        gap: 12px;
    }

    h2 {
        margin-top: 6px;
        padding-top: 14px;
        border-top: 1px solid var(--panel-line);
        color: var(--ink-dim);
        font-weight: normal;
    }

    .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px 16px;
        min-width: 0;
        margin: 0;
        padding: 0;
        border: 0;
    }
    label.row {
        cursor: pointer;
    }
    /* A legend won't flex; floating it lets it sit in the row beside its options. */
    legend {
        float: left;
        padding: 0;
    }
    fieldset:disabled {
        color: var(--ink-faint);
        cursor: default;
    }

    .segments {
        display: flex;
        margin-left: auto;
    }
    .segments button {
        position: relative;
        padding: 4px 9px;
        border: 1px solid var(--panel-line);
        background: var(--control);
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.04em;
        cursor: pointer;
    }
    .segments button + button {
        margin-left: -1px;
    }
    .segments [aria-pressed='true'] {
        z-index: 1;
        border-color: var(--accent);
        color: var(--accent);
    }
    .segments button:disabled {
        border-color: var(--panel-line);
        color: inherit;
        cursor: default;
    }
    .segments button:focus-visible {
        z-index: 2;
        outline-offset: 2px;
    }

    /* A switch: a square track with a square knob that slides right, accent-filled, when on. */
    [role='switch'] {
        appearance: none;
        position: relative;
        flex: none;
        width: 34px;
        height: 18px;
        margin: 0;
        border: 1px solid var(--panel-line);
        background: var(--control);
        cursor: pointer;
    }
    [role='switch']::before {
        content: '';
        position: absolute;
        top: 3px;
        left: 3px;
        width: 10px;
        height: 10px;
        background: var(--ink-dim);
    }
    [role='switch']:checked {
        border-color: var(--accent);
        background: var(--accent);
    }
    [role='switch']:checked::before {
        left: 19px;
        background: var(--panel);
    }
    :global(:root[data-motion='full']) [role='switch']::before {
        transition: left 140ms ease;
    }
</style>
