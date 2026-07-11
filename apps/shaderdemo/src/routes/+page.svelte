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
        type GpuTimingStats,
    } from '$lib/renderer';
    import { GpuTelemetry, type FrameRollingSummary, type GpuRollingSummary } from '$lib/telemetry';
    import { defaultShaderSettings, normalizeSavedSettings, shaderSettings } from '$lib/settings';
    import AdjustmentEditor from '$lib/AdjustmentEditor.svelte';
    import { MAX_ADJUSTMENTS, newCurve, newHslCurve, newLevels, type Adjustment } from '$lib/adjustments';

    let canvas: HTMLCanvasElement;
    let renderer: AtmosphereRenderer | undefined;
    let options: RenderOptions = {
        seed: 4.2,
        dprCap: Number.POSITIVE_INFINITY,
        renderScale: 1,
        parameters: defaultParameters(),
        adjustments: [],
    };
    let paused = false;
    let controlsOpen = true;
    let telemetryOpen = true;
    let ready = false;
    let status = 'Starting WebGPU…';
    let frameStats: FrameRollingSummary | undefined;
    let gpuStats: GpuTimingStats | null | undefined;
    let gpuRolling: GpuRollingSummary | undefined;
    const gpuTelemetry = new GpuTelemetry();
    const number = (value: number | undefined) => (value === undefined ? '…' : value.toFixed(1));
    const parameterTabs = [
        { id: 'field', label: 'Field' },
        { id: 'octaves', label: 'Octaves' },
        { id: 'adjustments', label: 'Curves & levels' },
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
                'secondaryRibbonBlendMode',
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
        const index = parameterTabs.findIndex((tab) => tab.id === selectedTabId);
        selectedTabId =
            parameterTabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + parameterTabs.length) % parameterTabs.length]
                .id;
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
        shaderSettings.set({ seed: options.seed, parameters: options.parameters, adjustments: options.adjustments });
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
    function resetDefaults() {
        const defaults = defaultShaderSettings();
        options = {
            ...options,
            seed: defaults.seed,
            parameters: defaults.parameters,
            adjustments: defaults.adjustments,
        };
        shaderSettings.set(defaults);
        renderer?.setOptions(options);
    }
    function replaceAdjustment(index: number, adjustment: Adjustment) {
        options = { ...options, adjustments: options.adjustments.map((item, i) => (i === index ? adjustment : item)) };
        update();
    }
    function addAdjustment(adjustment: Adjustment) {
        if (options.adjustments.length >= MAX_ADJUSTMENTS) return;
        options = { ...options, adjustments: [...options.adjustments, adjustment] };
        update();
    }
    function moveAdjustment(index: number, direction: number) {
        const target = index + direction;
        if (target < 0 || target >= options.adjustments.length) return;
        const adjustments = [...options.adjustments];
        [adjustments[index], adjustments[target]] = [adjustments[target], adjustments[index]];
        options = { ...options, adjustments };
        update();
    }
    onMount(() => {
        let disposed = false;
        // Mounting the persistent atom synchronously hydrates it from localStorage.
        let persisted = shaderSettings.get();
        const stopHydration = shaderSettings.subscribe((value) => (persisted = value));
        stopHydration();
        const saved = normalizeSavedSettings(persisted);
        options = { ...options, seed: saved.seed, parameters: saved.parameters, adjustments: saved.adjustments };
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) paused = true;
        AtmosphereRenderer.create(canvas, options)
            .then((instance) => {
                if (disposed) return instance.destroy();
                renderer = instance;
                instance.onStats = (_value, _width, _height, rolling) => (frameStats = rolling);
                instance.onGpuStats = (value) => {
                    gpuStats = value;
                    if (value) {
                        const now = performance.now();
                        gpuTelemetry.record(now, value);
                        gpuRolling = gpuTelemetry.summary(now);
                    }
                };
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
    {#if ready}<div class="telemetry">
            <button
                class="telemetry-toggle"
                onclick={() => (telemetryOpen = !telemetryOpen)}
                aria-expanded={telemetryOpen}
                aria-controls="performance-telemetry"
                >{telemetryOpen ? '×' : 'FPS'}<span class="sr-only"
                    >{telemetryOpen ? 'Hide' : 'Show'} performance telemetry</span
                ></button
            >
            {#if telemetryOpen}<output class="fps" id="performance-telemetry">
                    {#if paused}
                        FPS paused/reset<br />frame RMS paused/reset
                    {:else}
                        FPS .5s {number(frameStats?.windows[500]?.fps)} · 2s {number(frameStats?.windows[2000]?.fps)} · 10s
                        {number(frameStats?.windows[10000]?.fps)}<br />frame RMS {number(frameStats?.rms2sMs)}ms
                    {/if}<br />
                    {#if gpuStats === null}
                        GPU timing unavailable
                    {:else if gpuRolling}
                        GPU 1s {number(gpuRolling.windows[1000]?.totalMs)} · 5s {number(
                            gpuRolling.windows[5000]?.totalMs,
                        )} · 30s
                        {number(gpuRolling.windows[30000]?.totalMs)}ms · RMS {number(gpuRolling.rms5sMs)}<br />
                        base {number(gpuRolling.windows[5000]?.baseMs)} · blur {number(
                            gpuRolling.windows[5000]?.blurMs,
                        )} · oct
                        {number(gpuRolling.windows[5000]?.octaveMs)} · out {number(gpuRolling.windows[5000]?.displayMs)}
                    {:else}
                        GPU timing…
                    {/if}
                </output>{/if}
        </div>{/if}
    <nav aria-label="Study controls" data-disabled={!ready} inert={!ready}>
        <button class="reveal" onclick={() => (controlsOpen = !controlsOpen)} aria-expanded={controlsOpen}
            >{controlsOpen ? '×' : '+'}<span class="sr-only">{controlsOpen ? 'Hide' : 'Show'} controls</span></button
        >
        {#if controlsOpen}
            <div class="controls">
                <button onclick={togglePause}>{paused ? 'Play' : 'Pause'}</button>
                <button onclick={randomize}>New seed</button>
                <button onclick={resetDefaults}>Reset defaults</button>
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
                    {:else if selectedTabId === 'octaves'}
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
                    {:else}
                        <div
                            class="sliders adjustment-stack"
                            id="panel-adjustments"
                            role="tabpanel"
                            aria-labelledby="tab-adjustments"
                        >
                            <div class="add-adjustments">
                                <button
                                    onclick={() => addAdjustment(newCurve())}
                                    disabled={options.adjustments.length >= MAX_ADJUSTMENTS}>Add curve</button
                                ><button
                                    onclick={() => addAdjustment(newLevels())}
                                    disabled={options.adjustments.length >= MAX_ADJUSTMENTS}>Add levels</button
                                >
                            </div>
                            {#each options.adjustments as adjustment, index (adjustment.id)}
                                <section class="adjustment">
                                    <div class="adjustment-heading">
                                        <strong
                                            >{adjustment.type === 'curve' ? 'Curve' : 'Levels'}
                                            {options.adjustments
                                                .slice(0, index + 1)
                                                .filter((a) => a.type === adjustment.type).length}</strong
                                        ><label
                                            ><span>Enabled</span><input
                                                type="checkbox"
                                                checked={adjustment.enabled}
                                                onchange={(e) =>
                                                    replaceAdjustment(index, {
                                                        ...adjustment,
                                                        enabled: e.currentTarget.checked,
                                                    })}
                                            /></label
                                        >
                                    </div>
                                    <div class="adjustment-actions">
                                        <button
                                            aria-label="Move up"
                                            disabled={index === 0}
                                            onclick={() => moveAdjustment(index, -1)}>↑</button
                                        ><button
                                            aria-label="Move down"
                                            disabled={index === options.adjustments.length - 1}
                                            onclick={() => moveAdjustment(index, 1)}>↓</button
                                        ><button
                                            onclick={() =>
                                                replaceAdjustment(
                                                    index,
                                                    adjustment.type === 'curve'
                                                        ? {
                                                              ...(adjustment.mode === 'hsl'
                                                                  ? newHslCurve()
                                                                  : newCurve()),
                                                              id: adjustment.id,
                                                          }
                                                        : { ...newLevels(), id: adjustment.id },
                                                )}>Reset</button
                                        ><button
                                            onclick={() => {
                                                options = {
                                                    ...options,
                                                    adjustments: options.adjustments.filter((_, i) => i !== index),
                                                };
                                                update();
                                            }}>Remove</button
                                        >
                                    </div>
                                    <AdjustmentEditor
                                        {adjustment}
                                        onchange={(value) => replaceAdjustment(index, value)}
                                    />
                                </section>
                            {/each}
                            {#if options.adjustments.length === 0}<p class="empty">No adjustments.</p>{/if}
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
    .telemetry {
        position: fixed;
        left: 14px;
        bottom: 12px;
        z-index: 1;
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 8px;
        background: #000c;
        color: #ffffff99;
        font:
            10px ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        text-shadow: 0 1px 3px #000;
    }
    .telemetry-toggle {
        min-width: 20px;
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        letter-spacing: inherit;
        text-transform: inherit;
        cursor: pointer;
    }
    .fps {
        line-height: 1.45;
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
        grid-template-columns: repeat(3, auto);
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
        grid-template-columns: repeat(3, 1fr);
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
    .add-adjustments,
    .adjustment-heading,
    .adjustment-actions {
        display: flex;
        align-items: center;
        gap: 4px;
    }
    .add-adjustments {
        justify-content: center;
        padding: 3px;
    }
    .adjustment {
        display: grid;
        gap: 7px;
        padding: 9px 2px;
        border-top: 1px solid #ffffff20;
    }
    .adjustment-heading {
        justify-content: space-between;
        color: #aaa;
    }
    .adjustment-heading label {
        color: #ddd;
        text-transform: none;
    }
    .adjustment-actions {
        justify-content: flex-end;
    }
    .adjustment-actions button:disabled {
        opacity: 0.3;
        cursor: default;
    }
    .empty {
        margin: 8px;
        color: #888;
        text-align: center;
        text-transform: none;
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
