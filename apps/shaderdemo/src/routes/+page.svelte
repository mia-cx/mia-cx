<script lang="ts">
    import { onMount } from 'svelte';
    import {
        AtmosphereRenderer,
        PARAMETER_SCHEMA,
        STAGES,
        defaultParameters,
        defaultStages,
        type ParameterKey,
        type RenderOptions,
    } from '$lib/renderer';

    let canvas: HTMLCanvasElement;
    let renderer: AtmosphereRenderer | undefined;
    let options: RenderOptions = {
        stages: defaultStages(),
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
        {
            id: 'field',
            label: 'Field',
            keys: [
                'baseScale',
                'flowStretch',
                'ridgeMix',
                'ridgeSharpness',
                'warpScale',
                'warpStrength',
                'threshold',
                'thresholdSoftness',
                'secondaryScale',
                'secondaryMix',
                'centerDarkness',
                'centerWidth',
                'centerHeight',
                'centerRoundness',
                'centerSoftness',
            ] satisfies ParameterKey[],
        },
        {
            id: 'octaves',
            label: 'Octaves',
            keys: ['lacunarity', 'persistence', 'edgeConcentration', 'recursiveMix'] satisfies ParameterKey[],
        },
        { id: 'output', label: 'Output', keys: ['finalSoftness', 'finalContrast'] satisfies ParameterKey[] },
        { id: 'motion', label: 'Motion', keys: ['animationSpeed'] satisfies ParameterKey[] },
    ] as const;
    let activeTab: (typeof parameterTabs)[number]['id'] = 'field';
    $: selectedTab = parameterTabs.find((tab) => tab.id === activeTab) ?? parameterTabs[0];
    const labels: Record<(typeof STAGES)[number], string> = {
        base: 'Base',
        octave1: 'Broad',
        octave2: 'Middle',
        octave3: 'Fine',
        animation: 'Motion',
    };

    function update() {
        options = { ...options, stages: { ...options.stages }, parameters: { ...options.parameters } };
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
    function selectAdjacentTab(event: KeyboardEvent, index: number) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next =
            event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? parameterTabs.length - 1
                  : (index + (event.key === 'ArrowRight' ? 1 : -1) + parameterTabs.length) % parameterTabs.length;
        activeTab = parameterTabs[next].id;
        document.getElementById(`tab-${activeTab}`)?.focus();
    }

    onMount(() => {
        let disposed = false;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) options.stages.animation = false;
        AtmosphereRenderer.create(canvas, options)
            .then((instance) => {
                if (disposed) return instance.destroy();
                renderer = instance;
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
    ><title>Recursive Field — WebGPU</title><meta
        name="description"
        content="A monochrome recursive octave-noise study."
    /></svelte:head
>

<main>
    <canvas class:ready bind:this={canvas} aria-label="Animated monochrome recursive noise field"></canvas>
    <nav aria-label="Study controls" data-disabled={!ready} inert={!ready}>
        <button class="reveal" onclick={() => (controlsOpen = !controlsOpen)} aria-expanded={controlsOpen}
            >{controlsOpen ? '×' : '+'}<span class="sr-only">{controlsOpen ? 'Hide' : 'Show'} controls</span></button
        >
        {#if controlsOpen}
            <div class="controls">
                {#each STAGES as stage}
                    <label
                        ><input type="checkbox" bind:checked={options.stages[stage]} onchange={update} /><span
                            >{labels[stage]}</span
                        ></label
                    >
                {/each}
                <i></i>
                <button onclick={togglePause}>{paused ? 'Play' : 'Pause'}</button>
                <button onclick={randomize}>New seed</button>
                <div class="parameters">
                    <div class="tabs" role="tablist" aria-label="Parameter groups">
                        {#each parameterTabs as tab, index}
                            <button
                                id="tab-{tab.id}"
                                type="button"
                                role="tab"
                                aria-selected={activeTab === tab.id}
                                aria-controls="panel-{tab.id}"
                                tabindex={activeTab === tab.id ? 0 : -1}
                                onclick={() => (activeTab = tab.id)}
                                onkeydown={(event) => selectAdjacentTab(event, index)}>{tab.label}</button
                            >
                        {/each}
                    </div>
                    <div
                        class="sliders"
                        id="panel-{selectedTab.id}"
                        role="tabpanel"
                        aria-labelledby="tab-{selectedTab.id}"
                    >
                        {#each PARAMETER_SCHEMA.filter( ({ key }) => selectedTab.keys.some((tabKey) => tabKey === key), ) as parameter}
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
        grid-template-columns: repeat(5, auto);
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
    .controls input[type='checkbox'] {
        appearance: none;
        width: 6px;
        height: 6px;
        margin: 0;
        border-radius: 50%;
        background: #555;
    }
    .controls input[type='checkbox']:checked {
        background: #fff;
        box-shadow: 0 0 5px #fff;
    }
    .controls i {
        width: 1px;
        height: 14px;
        background: #ffffff30;
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
        grid-template-columns: repeat(4, 1fr);
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
        .controls i {
            display: none;
        }
    }
</style>
