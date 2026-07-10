<script lang="ts">
    import { onMount } from 'svelte';
    import {
        AtmosphereRenderer,
        STAGES,
        defaultStages,
        type BlendMode,
        type DebugView,
        type RenderOptions,
    } from '$lib/renderer';
    let canvas: HTMLCanvasElement;
    let renderer: AtmosphereRenderer | undefined;
    let options: RenderOptions = {
        stages: defaultStages(),
        debug: 'final',
        blend: 'screen',
        seed: 4.2,
        speed: 0.28,
        dprCap: 1.5,
        renderScale: 0.7,
        warp: 0.72,
        detail: 0.65,
        colorIntensity: 1,
        duplicateOpacity: 0.5,
        duplicateRotation: 0.37,
        duplicateScale: 0.92,
        bloomIntensity: 0.65,
        bloomRadius: 1.5,
        chromaticAmount: 2,
    };
    let paused = false,
        fps = 0,
        resolution = '—',
        status = 'Starting WebGPU…',
        panelOpen = true,
        ready = false;
    const labels: Record<string, string> = {
        metablobs: 'Base masses',
        warp: 'Domain warp',
        octaves: 'Octave detail',
        edges: 'Frayed edges',
        color: 'Nonlinear color',
        duplicate: 'Duplicate layer',
        bloom: 'Bloom',
        chromatic: 'Chromatic split',
        grain: 'Film grain',
        animation: 'Animation',
    };
    function invalidate() {
        options = { ...options, stages: { ...options.stages } };
        renderer?.setOptions(options);
    }
    function setPause(v: boolean) {
        paused = v;
        renderer?.setPaused(v);
    }
    function randomize() {
        options.seed = Math.random() * 1000;
        invalidate();
    }
    onMount(() => {
        let disposed = false;
        const reduced = matchMedia('(prefers-reduced-motion: reduce)');
        if (reduced.matches) {
            options.stages.animation = false;
            invalidate();
        }
        AtmosphereRenderer.create(canvas, options)
            .then((r) => {
                if (disposed) {
                    r.destroy();
                    return;
                }
                renderer = r;
                ready = true;
                status = 'Rendering with WebGPU';
                r.onStats = (f, w, h) => {
                    fps = f;
                    resolution = `${w} × ${h}`;
                };
                r.onLost = (m) => (status = m);
            })
            .catch((e) => {
                if (!disposed) status = e instanceof Error ? e.message : String(e);
            });
        const visibility = () => {
            if (document.hidden) renderer?.setPaused(true);
            else if (!paused) renderer?.setPaused(false);
        };
        document.addEventListener('visibilitychange', visibility);
        return () => {
            disposed = true;
            document.removeEventListener('visibilitychange', visibility);
            renderer?.destroy();
        };
    });
</script>

<svelte:head
    ><title>Chromatic Atmosphere — WebGPU</title><meta
        name="description"
        content="An interactive, procedural WebGPU atmosphere study."
    /></svelte:head
>
<main>
    <canvas
        class:ready
        bind:this={canvas}
        aria-label="Animated cyan, pink, lavender and deep blue procedural atmosphere"
    ></canvas>
    <header>
        <div>
            <p class="eyebrow">WEBGPU STUDY / 01</p>
            <h1>Chromatic<br />Atmosphere</h1>
        </div>
        <button class="panel-toggle" aria-expanded={panelOpen} onclick={() => (panelOpen = !panelOpen)}
            >{panelOpen ? 'Hide controls' : 'Show controls'}</button
        >
    </header>
    <div class="status" aria-live="polite">
        <span class:active={status === 'Rendering with WebGPU'}></span>{status} · {fps
            ? `${fps.toFixed(0)} FPS`
            : '— FPS'} · {resolution}
    </div>
    {#if panelOpen}<aside aria-label="Shader controls" data-disabled={!ready} inert={!ready}>
            <div class="bar">
                <strong>Pipeline</strong><button onclick={() => setPause(!paused)} aria-pressed={paused}
                    >{paused ? 'Resume' : 'Pause'}</button
                >
            </div>
            <fieldset>
                <legend>Stages</legend>
                <div class="checks">
                    {#each STAGES as stage}<label
                            ><input type="checkbox" bind:checked={options.stages[stage]} onchange={invalidate} /><span
                                >{labels[stage]}</span
                            ></label
                        >{/each}
                </div>
            </fieldset>
            <div class="grid">
                <label
                    >Debug view<select bind:value={options.debug} onchange={invalidate}
                        ><option value="final">Final composite</option><option value="field">Scalar field</option
                        ><option value="edges">Edge mask</option><option value="duplicate">Duplicate layer</option
                        ><option value="bloom-source">Bloom source</option></select
                    ></label
                >
                <label
                    >Layer blend<select bind:value={options.blend} onchange={invalidate}
                        ><option value="screen">Screen</option><option value="add">Add</option><option
                            value="soft-light">Soft light</option
                        ></select
                    ></label
                >
            </div>
            <label class="range"
                >Motion speed <output>{options.speed.toFixed(2)}</output><input
                    aria-label="Motion speed"
                    type="range"
                    min="0"
                    max="1"
                    step=".01"
                    bind:value={options.speed}
                    onchange={invalidate}
                /></label
            >
            <label class="range"
                >DPR cap <output>{options.dprCap.toFixed(1)}</output><input
                    aria-label="Device pixel ratio cap"
                    type="range"
                    min="0.5"
                    max="2"
                    step=".1"
                    bind:value={options.dprCap}
                    onchange={() => {
                        invalidate();
                        renderer?.resize();
                    }}
                /></label
            >
            {#each [['Render scale', 'renderScale', 0.35, 1, 0.05], ['Warp', 'warp', 0, 1.5, 0.01], ['Detail', 'detail', 0, 1, 0.01], ['Color curve', 'colorIntensity', 0, 1, 0.01], ['Duplicate opacity', 'duplicateOpacity', 0, 1, 0.01], ['Duplicate rotation', 'duplicateRotation', -3.14, 3.14, 0.01], ['Duplicate scale', 'duplicateScale', 0.5, 1.5, 0.01], ['Bloom intensity', 'bloomIntensity', 0, 2, 0.01], ['Bloom radius', 'bloomRadius', 0.25, 4, 0.05], ['Chromatic amount', 'chromaticAmount', 0, 8, 0.1]] as control}
                <label class="range"
                    >{control[0]} <output>{Number(options[control[1] as keyof RenderOptions]).toFixed(2)}</output><input
                        aria-label={String(control[0])}
                        type="range"
                        min={control[2]}
                        max={control[3]}
                        step={control[4]}
                        value={options[control[1] as keyof RenderOptions] as number}
                        oninput={(e) => {
                            (options[control[1] as keyof RenderOptions] as number) = e.currentTarget.valueAsNumber;
                            invalidate();
                        }}
                    /></label
                >
            {/each}
            <div class="seed">
                <label>Seed <input type="number" bind:value={options.seed} onchange={invalidate} /></label><button
                    onclick={randomize}>Randomize</button
                >
            </div>
            <p class="hint">
                Stage toggles are independent. Debug views isolate pipeline outputs. The demo pauses when hidden and
                respects reduced motion.
            </p>
        </aside>{/if}
</main>

<style>
    :global(*) {
        box-sizing: border-box;
    }
    :global(html, body) {
        margin: 0;
        height: 100%;
        overflow: hidden;
        background: #050414;
        color: #f7f4ff;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    }
    button,
    input,
    select {
        font: inherit;
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
        background: radial-gradient(circle at 65% 35%, #172659, #050414 65%);
    }
    canvas.ready {
        opacity: 1;
        transition: opacity 0.25s ease;
    }
    aside[data-disabled='true'] {
        opacity: 0.65;
    }
    header {
        position: fixed;
        top: clamp(20px, 4vw, 54px);
        left: clamp(20px, 4vw, 58px);
        right: clamp(20px, 4vw, 58px);
        display: flex;
        justify-content: space-between;
        pointer-events: none;
    }
    h1 {
        font:
            300 clamp(2.4rem, 7vw, 6.8rem) / 0.82 Georgia,
            serif;
        letter-spacing: -0.06em;
        margin: 0.15em 0;
        text-shadow: 0 3px 35px #060319;
    }
    .eyebrow {
        font-size: 0.66rem;
        letter-spacing: 0.24em;
    }
    .panel-toggle,
    button {
        pointer-events: auto;
        border: 1px solid #ffffff40;
        background: #09071abb;
        color: inherit;
        padding: 0.5rem 0.75rem;
        border-radius: 99px;
        cursor: pointer;
    }
    .panel-toggle {
        height: max-content;
    }
    button:hover,
    button:focus-visible {
        background: #ffffff22;
        outline: 2px solid #79fff1;
        outline-offset: 2px;
    }
    aside {
        position: fixed;
        right: clamp(14px, 3vw, 38px);
        bottom: clamp(42px, 6vw, 64px);
        width: min(360px, calc(100vw - 28px));
        max-height: min(600px, 72vh);
        overflow: auto;
        padding: 1rem;
        background: #080719d9;
        border: 1px solid #ffffff25;
        border-radius: 14px;
        backdrop-filter: blur(18px);
        box-shadow: 0 16px 60px #0008;
        font-size: 0.75rem;
    }
    .bar,
    .seed {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .bar strong {
        font-size: 0.85rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }
    fieldset {
        border: 0;
        padding: 0;
        margin: 1rem 0;
    }
    legend {
        color: #aaa5bd;
        margin-bottom: 0.5rem;
    }
    .checks {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.35rem;
    }
    .checks label {
        display: flex;
        gap: 0.4rem;
        align-items: center;
    }
    .checks input {
        accent-color: #ff5ca8;
    }
    .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.6rem;
    }
    .grid label,
    .range {
        display: block;
        color: #b9b5ca;
    }
    .grid select,
    .seed input {
        width: 100%;
        margin-top: 0.3rem;
        background: #100d28;
        color: white;
        border: 1px solid #ffffff30;
        border-radius: 5px;
        padding: 0.35rem;
    }
    .range {
        margin-top: 0.75rem;
    }
    .range output {
        float: right;
        color: white;
    }
    .range input {
        display: block;
        width: 100%;
        accent-color: #76eade;
    }
    .seed {
        gap: 0.6rem;
        margin-top: 0.8rem;
    }
    .seed label {
        flex: 1;
        color: #b9b5ca;
    }
    .hint {
        color: #8d899d;
        line-height: 1.4;
        margin-bottom: 0;
    }
    .status {
        position: fixed;
        left: clamp(20px, 4vw, 58px);
        bottom: 24px;
        font: 600 0.6rem/1 monospace;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #bbb6ca;
    }
    .status span {
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #ff648c;
        margin-right: 7px;
    }
    .status span.active {
        background: #73ffdd;
        box-shadow: 0 0 9px #73ffdd;
    }
    @media (max-width: 600px) {
        h1 {
            font-size: 3rem;
        }
        aside {
            max-height: 62vh;
        }
        .checks {
            grid-template-columns: 1fr 1fr;
        }
    }
</style>
