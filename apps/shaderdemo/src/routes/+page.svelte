<script lang="ts">
    import { onMount } from 'svelte';
    import {
        AtmosphereRenderer,
        FIELD_PARAMETER_SCHEMA,
        OCTAVE_PARAMETER_SCHEMA,
        defaultParameters,
        type RenderOptions,
    } from '$lib/renderer';

    let canvas: HTMLCanvasElement;
    let renderer: AtmosphereRenderer | undefined;
    let options: RenderOptions = {
        seed: 4.2,
        dprCap: 1.5,
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

    function tabKeydown(event: KeyboardEvent) {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        selectedTabId = selectedTabId === 'field' ? 'octaves' : 'field';
        requestAnimationFrame(() => document.getElementById(`tab-${selectedTabId}`)?.focus());
    }

    function update() {
        options = { ...options, parameters: { ...options.parameters } };
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
                            {#each FIELD_PARAMETER_SCHEMA as parameter}
                                <label class="parameter">
                                    <span>{parameter.label}</span><output
                                        >{options.parameters[parameter.key].toFixed(2)}</output
                                    >
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
                        </div>
                    {:else}
                        <div class="sliders" id="panel-octaves" role="tabpanel" aria-labelledby="tab-octaves">
                            {#each OCTAVE_PARAMETER_SCHEMA as parameters, index}
                                <fieldset class="octave">
                                    <legend>Octave {index + 1}</legend>
                                    {#each parameters as parameter}
                                        <label class="parameter">
                                            <span>{parameter.label}</span><output
                                                >{options.parameters[parameter.key].toFixed(2)}</output
                                            >
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
        grid-template-columns: 1fr 40px;
        gap: 2px 7px;
        cursor: default;
        letter-spacing: 0.03em;
        text-transform: none;
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
    .parameter output {
        color: #aaa;
        text-align: right;
        font-variant-numeric: tabular-nums;
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
