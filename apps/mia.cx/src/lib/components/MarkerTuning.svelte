<!--
    Mia's tuning panel for the highlight, open on any page with `?debug` in its address. Its values
    set the attributes of the page's `<mia-marker>` and stay in this browser, applied on every page
    whether the panel is open or not, until Defaults clears them. Once a feel is right, the values
    become the marker's own defaults.
-->
<script lang="ts">
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';

    const KEY = 'marker-tuning';

    /** Each knob is a marker attribute: a slider, plus a number field for exact values past its range. */
    const KNOBS = [
        { name: 'leading', label: 'Leading edge', unit: 'ms', min: 0, max: 400, start: 200 },
        { name: 'trailing', label: 'Trailing edge', unit: 'ms', min: 0, max: 600, start: 200 },
        { name: 'leading-delay', label: 'Leading delay', unit: 'ms', min: -300, max: 300, start: 0 },
        { name: 'trailing-delay', label: 'Trailing delay', unit: 'ms', min: -300, max: 300, start: 0 },
        { name: 'stagger', label: 'Deselect stagger', unit: 'ms', min: 0, max: 200, start: 150 },
        { name: 'padding', label: 'Padding', unit: 'px', min: 0, max: 10, start: 4, step: 0.5 },
        { name: 'radius', label: 'Corner radius', unit: 'px', min: 0, max: 14, start: 0 },
    ] as const;
    type Knob = (typeof KNOBS)[number]['name'];

    const defaults = () => Object.fromEntries(KNOBS.map((k) => [k.name, k.start])) as Record<Knob, number>;

    function saved(): Partial<Record<Knob, number>> {
        try {
            return JSON.parse(localStorage.getItem(KEY) ?? '{}');
        } catch {
            // Unreadable or blocked storage: start from the marker's defaults.
            return {};
        }
    }

    let open = $state(false);
    /** Only what has been tuned; anything else keeps the marker's own default. */
    let tuned = $state(browser ? saved() : {});
    const values = $derived({ ...defaults(), ...tuned });

    onMount(() => (open = new URLSearchParams(location.search).has('debug')));

    $effect(() => {
        const marker = document.querySelector('mia-marker');
        if (!marker) return;
        for (const { name } of KNOBS) {
            const value = tuned[name];
            if (value === undefined) marker.removeAttribute(name);
            else marker.setAttribute(name, String(value));
        }
        try {
            if (Object.keys(tuned).length) localStorage.setItem(KEY, JSON.stringify(tuned));
            else localStorage.removeItem(KEY);
        } catch {
            // Without storage the tuning lasts this page view.
        }
    });

    function set(name: Knob, value: number) {
        if (Number.isFinite(value)) tuned = { ...tuned, [name]: value };
    }
</script>

{#if open}
    <aside class="panel mono" aria-label="Highlight tuning" data-print-hide>
        {#each KNOBS as knob (knob.name)}
            <label class="knob">
                {knob.label}
                <span
                    ><input
                        type="number"
                        step={'step' in knob ? knob.step : 1}
                        value={values[knob.name]}
                        oninput={(e) => set(knob.name, e.currentTarget.valueAsNumber)}
                    />
                    {knob.unit}</span
                >
                <input
                    type="range"
                    min={knob.min}
                    max={knob.max}
                    step={'step' in knob ? knob.step : 1}
                    value={values[knob.name]}
                    oninput={(e) => set(knob.name, e.currentTarget.valueAsNumber)}
                />
            </label>
        {/each}
        <p>A negative delay moves that edge before the word is spoken.</p>
        <button type="button" onclick={() => (tuned = {})}>Defaults</button>
    </aside>
{/if}

<style>
    .panel {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 50;
        display: grid;
        gap: 8px;
        width: min(300px, calc(100vw - 32px));
        /* Taller than short windows: it scrolls instead of losing its top off screen. */
        max-height: calc(100dvh - 32px);
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 14px;
        border: 1px solid var(--panel-line);
        background: color-mix(in oklab, var(--bg) 88%, transparent);
        backdrop-filter: blur(12px);
        font-size: 12px;
    }
    .knob {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 2px 8px;
    }
    .knob input[type='range'] {
        grid-column: 1 / -1;
    }
    .knob span {
        color: var(--ink-dim);
    }
    .knob input[type='number'] {
        box-sizing: content-box;
        width: 6ch;
        padding: 2px 6px;
        border: 1px solid color-mix(in oklab, var(--ink) 30%, transparent);
        color: var(--ink);
        background: none;
        font: inherit;
        text-align: right;
        /* No spinner arrows: they eat the field's width. Typing and arrow keys still work. */
        appearance: textfield;
    }
    .knob input[type='number']::-webkit-inner-spin-button,
    .knob input[type='number']::-webkit-outer-spin-button {
        appearance: none;
        margin: 0;
    }
    p {
        margin: 0;
        color: var(--ink-dim);
        text-transform: none;
        letter-spacing: 0;
        line-height: 1.4;
    }
    button {
        padding: 6px;
        border: 1px solid var(--panel-line);
        color: var(--ink);
        background: none;
        font: inherit;
        cursor: pointer;
    }
    button:hover {
        border-color: var(--accent);
        color: var(--accent);
    }
</style>
