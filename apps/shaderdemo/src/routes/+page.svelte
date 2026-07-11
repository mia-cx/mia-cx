<script lang="ts">
    import { onMount } from 'svelte';
    import {
        AtmosphereRenderer,
        FIELD_PARAMETER_SCHEMA,
        OCTAVE_BLUR_SCHEMA,
        OCTAVE_PARAMETER_SCHEMA,
        OCTAVE_PIXELATE_SCHEMA,
        PARAMETER_SCHEMA,
        defaultParameters,
        type ParameterKey,
        type RenderOptions,
    } from '$lib/renderer';
    import { normalizeSavedSettings, shaderSettings } from '$lib/settings';

    let canvas: HTMLCanvasElement;
    let renderer: AtmosphereRenderer | undefined;
    let options: RenderOptions = {
        seed: 4.2,
        dprCap: Number.POSITIVE_INFINITY,
        renderScale: 1,
        parameters: defaultParameters(),
    };
    let paused = false;
    let controlsOpen = true;
    let ready = false;
    let status = 'Starting WebGPU…';
    const parameterTabs = [
        { id: 'field', label: 'Field' },
        { id: 'octaves', label: 'Octaves' },
    ] as const;
    let selectedTabId: (typeof parameterTabs)[number]['id'] = 'field';
    const fieldGroups: { label: string; keys: ParameterKey[]; toggle?: ParameterKey }[] = [
        {
            label: 'Base generator',
            keys: [
                'fieldScale',
                'flowStretch',
                'billowAmount',
                'ridgeAmount',
                'ridgeSharpness',
                'baseBlendMode',
                'warpScale',
                'warpStrength',
            ],
        },
        {
            label: 'Secondary detail',
            toggle: 'secondaryEnabled',
            keys: [
                'secondaryScale',
                'secondaryCloudAmount',
                'secondaryRibbonAmount',
                'secondaryRibbonSharpness',
                'secondaryBlendMode',
            ],
        },
        { label: 'Threshold', toggle: 'thresholdEnabled', keys: ['threshold', 'thresholdSoftness'] },
        { label: 'Output', keys: ['finalContrast'] },
        {
            label: 'Center attenuation',
            keys: ['centerDarkness', 'centerWidth', 'centerHeight', 'centerRoundness', 'centerSoftness'],
        },
        { label: 'Motion', keys: ['animationSpeed'] },
    ];

    function tabKeydown(event: KeyboardEvent) {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        selectedTabId = selectedTabId === 'field' ? 'octaves' : 'field';
        requestAnimationFrame(() => document.getElementById(`tab-${selectedTabId}`)?.focus());
    }

    function update() {
        const parameters = { ...options.parameters };
        for (const parameter of PARAMETER_SCHEMA) {
            const value = Number(parameters[parameter.key]);
            parameters[parameter.key] = Number.isFinite(value)
                ? parameter.key.endsWith('BlendMode')
                    ? Math.round(Math.min(parameter.max, Math.max(parameter.min, value)))
                    : Math.min(parameter.max, Math.max(parameter.min, value))
                : parameter.default;
        }
        options = { ...options, parameters };
        shaderSettings.set({ seed: options.seed, parameters: options.parameters });
        renderer?.setOptions(options);
    }
    function togglePause() {
        paused = !paused;
        renderer?.setPaused(paused);
    }
    function randomize() {
        options.seed = Math.random() * 1000;
        update();
    }
    onMount(() => {
        let disposed = false;
        // Mounting the persistent atom synchronously hydrates it from localStorage.
        let persisted = shaderSettings.get();
        const stopHydration = shaderSettings.subscribe((value) => (persisted = value));
        stopHydration();
        const saved = normalizeSavedSettings(persisted);
        options = { ...options, seed: saved.seed, parameters: saved.parameters };
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) paused = true;
        AtmosphereRenderer.create(canvas, options)
            .then((instance) => {
                if (disposed) return instance.destroy();
                renderer = instance;
                instance.setPaused(paused);
                ready = true;
                status = 'WebGPU';
                instance.onLost = (message) => (status = message);
            })
            .catch((error) => {
                if (!disposed) status = error instanceof Error ? error.message : String(error);
            });
        const visibility = () => renderer?.setPaused(document.hidden || paused);
        document.addEventListener('visibilitychange', visibility);
        return () => {
            disposed = true;
            document.removeEventListener('visibilitychange', visibility);
            renderer?.destroy();
        };
    });
</script>

<svelte:head
    ><title>Noise Field — WebGPU</title><meta
        name="description"
        content="A monochrome domain-warped noise study."
    /></svelte:head
>

<main>
    <canvas class:ready bind:this={canvas} aria-label="Animated monochrome noise field"></canvas>
    <nav aria-label="Study controls" data-disabled={!ready} inert={!ready}>
        <button class="reveal" onclick={() => (controlsOpen = !controlsOpen)} aria-expanded={controlsOpen}
            >{controlsOpen ? '×' : '+'}<span class="sr-only">{controlsOpen ? 'Hide' : 'Show'} controls</span></button
        >
        {#if controlsOpen}
            <div class="controls">
                <button onclick={togglePause}>{paused ? 'Play' : 'Pause'}</button>
                <button onclick={randomize}>New seed</button>
                <div class="parameters">
                    <div class="tabs" role="tablist" aria-label="Parameter groups">
                        {#each parameterTabs as tab}
                            <button
                                id="tab-{tab.id}"
                                type="button"
                                role="tab"
                                aria-selected={selectedTabId === tab.id}
                                aria-controls="panel-{tab.id}"
                                tabindex={selectedTabId === tab.id ? 0 : -1}
                                onclick={() => (selectedTabId = tab.id)}
                                onkeydown={tabKeydown}>{tab.label}</button
                            >
                        {/each}
                    </div>
                    {#if selectedTabId === 'field'}
                        <div class="sliders" id="panel-field" role="tabpanel" aria-labelledby="tab-field">
                            {#each fieldGroups as group}
                                <section class="field-group">
                                    <div class="group-heading">
                                        <span>{group.label}</span>
                                        {#if group.toggle}
                                            <label class="enabled">
                                                <span>Enabled</span>
                                                <input
                                                    type="checkbox"
                                                    checked={options.parameters[group.toggle] >= 0.5}
                                                    onchange={(event) => {
                                                        options.parameters[group.toggle!] = event.currentTarget.checked
                                                            ? 1
                                                            : 0;
                                                        update();
                                                    }}
                                                />
                                            </label>
                                        {/if}
                                    </div>
                                    {#each FIELD_PARAMETER_SCHEMA.filter( ({ key }) => group.keys.includes(key), ) as parameter}
                                        {#if parameter.key.endsWith('BlendMode')}
                                            <label class="blend-mode">
                                                <span>{parameter.label}</span>
                                                <select
                                                    bind:value={options.parameters[parameter.key]}
                                                    onchange={update}
                                                >
                                                    <option value={0}>Add</option>
                                                    <option value={1}>Screen</option>
                                                    <option value={2}>Overlay</option>
                                                </select>
                                            </label>
                                        {:else}
                                            <label class="parameter">
                                                <span>{parameter.label}</span>
                                                <input
                                                    class="exact-value"
                                                    aria-label={`${parameter.label} exact value`}
                                                    type="number"
                                                    min={parameter.min}
                                                    max={parameter.max}
                                                    step={parameter.step}
                                                    bind:value={options.parameters[parameter.key]}
                                                    onchange={update}
                                                />
                                                <input
                                                    type="range"
                                                    min={parameter.min}
                                                    max={parameter.max}
                                                    step={parameter.step}
                                                    bind:value={options.parameters[parameter.key]}
                                                    oninput={update}
                                                />
                                            </label>
                                        {/if}
                                    {/each}
                                </section>
                            {/each}
                        </div>
                    {:else}
                        <div class="sliders" id="panel-octaves" role="tabpanel" aria-labelledby="tab-octaves">
                            {#each OCTAVE_PARAMETER_SCHEMA as parameters, index}
                                <fieldset class="octave">
                                    <legend>Octave {index + 1}</legend>
                                    <label class="pixelate">
                                        <span>{OCTAVE_PIXELATE_SCHEMA[index].label}</span>
                                        <input
                                            type="checkbox"
                                            checked={options.parameters[OCTAVE_PIXELATE_SCHEMA[index].key] >= 0.5}
                                            onchange={(event) => {
                                                options.parameters[OCTAVE_PIXELATE_SCHEMA[index].key] = event
                                                    .currentTarget.checked
                                                    ? 1
                                                    : 0;
                                                update();
                                            }}
                                        />
                                    </label>
                                    {#each [OCTAVE_BLUR_SCHEMA[index], ...parameters] as parameter}
                                        <label class="parameter">
                                            <span>{parameter.label}</span>
                                            <input
                                                class="exact-value"
                                                aria-label={`Octave ${index + 1} ${parameter.label} exact value`}
                                                type="number"
                                                min={parameter.min}
                                                max={parameter.max}
                                                step={parameter.step}
                                                bind:value={options.parameters[parameter.key]}
                                                onchange={update}
                                            />
                                            <input
                                                type="range"
                                                min={parameter.min}
                                                max={parameter.max}
                                                step={parameter.step}
                                                bind:value={options.parameters[parameter.key]}
                                                oninput={update}
                                            />
                                        </label>
                                    {/each}
                                </fieldset>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
    </nav>
    {#if !ready}<p class="status" aria-live="polite">{status}</p>{/if}
</main>

<style>
    :global(*) {
        box-sizing: border-box;
    }
    :global(html, body) {
        margin: 0;
        height: 100%;
        overflow: hidden;
        background: #050505;
        color: #eee;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    main,
    canvas {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
    }
    canvas {
        display: block;
        opacity: 0;
        background: #050505;
    }
    canvas.ready {
        opacity: 1;
        transition: opacity 0.35s ease;
    }
    nav {
        position: fixed;
        top: 14px;
        right: 14px;
        display: flex;
        align-items: flex-start;
        gap: 7px;
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }
    nav[data-disabled='true'] {
        opacity: 0.35;
    }
    button,
    .controls {
        border: 1px solid #ffffff2b;
        background: #090909c7;
        color: #ddd;
        backdrop-filter: blur(10px);
    }
    button {
        font: inherit;
        color: inherit;
        text-transform: uppercase;
        letter-spacing: inherit;
        padding: 7px 9px;
        cursor: pointer;
    }
    button:hover,
    button:focus-visible {
        background: #eee;
        color: #111;
        outline: none;
    }
    .reveal {
        width: 29px;
        height: 29px;
        padding: 0;
        border-radius: 50%;
        font-size: 15px;
    }
    .controls {
        display: grid;
        grid-template-columns: repeat(2, auto);
        align-items: center;
        gap: 10px;
        padding: 5px 6px 5px 10px;
        border-radius: 2px;
        width: min(290px, calc(100vw - 58px));
        max-height: calc(100vh - 28px);
        overflow-y: auto;
    }
    .controls label {
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
    }

    .controls button {
        border: 0;
        background: transparent;
        padding: 3px 5px;
        backdrop-filter: none;
    }
    .parameters {
        grid-column: 1 / -1;
        min-width: 0;
        border-top: 1px solid #ffffff20;
    }
    .tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2px;
        padding: 4px 0;
    }
    .controls .tabs button {
        padding: 5px 2px;
        color: #888;
    }
    .controls .tabs button[aria-selected='true'] {
        background: #ffffff18;
        color: #fff;
    }
    .sliders {
        display: grid;
        gap: 7px;
        max-height: min(52vh, 390px);
        overflow-y: auto;
        padding: 3px 4px 4px;
    }
    .controls .parameter {
        display: grid;
        grid-template-columns: 1fr 62px;
        gap: 2px 7px;
        cursor: default;
        letter-spacing: 0.03em;
        text-transform: none;
    }
    .field-group {
        display: grid;
        gap: 7px;
        padding: 8px 0 2px;
    }
    .field-group + .field-group {
        border-top: 1px solid #ffffff20;
    }
    .group-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: #aaa;
    }
    .controls .enabled {
        color: #ddd;
        text-transform: none;
        letter-spacing: 0.03em;
    }
    .controls .blend-mode {
        justify-content: space-between;
        text-transform: none;
        letter-spacing: 0.03em;
    }
    .blend-mode select {
        padding: 1px 2px;
        border: 0;
        border-bottom: 1px solid #ffffff24;
        border-radius: 0;
        background: #090909;
        color: #ddd;
        font: inherit;
    }
    .octave {
        display: grid;
        gap: 6px;
        margin: 0;
        padding: 7px 3px 9px;
        border: 0;
        border-top: 1px solid #ffffff20;
    }
    .octave legend {
        padding: 0;
        color: #aaa;
    }
    .parameter .exact-value {
        width: 100%;
        min-width: 0;
        padding: 1px 2px;
        border: 0;
        border-bottom: 1px solid #ffffff24;
        border-radius: 0;
        outline: none;
        background: transparent;
        color: #aaa;
        font: inherit;
        text-align: right;
        font-variant-numeric: tabular-nums;
    }
    .parameter .exact-value:focus {
        border-bottom-color: #ddd;
        color: #fff;
    }
    .parameter input[type='range'] {
        grid-column: 1 / -1;
        width: 100%;
        height: 10px;
        margin: 0;
        accent-color: #ddd;
        cursor: ew-resize;
    }
    .status {
        position: fixed;
        left: 14px;
        bottom: 10px;
        max-width: calc(100vw - 28px);
        margin: 0;
        color: #888;
        font-size: 10px;
    }
    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }
    @media (max-width: 650px) {
        .controls {
            max-width: calc(100vw - 58px);
            flex-wrap: wrap;
            justify-content: flex-end;
        }
    }
</style>
