<script lang="ts">
    import { onMount } from 'svelte';
    import {
        FIELD_BLEND_MODES,
        FIELD_PARAMETER_SCHEMA,
        OCTAVE_BLUR_SCHEMA,
        OCTAVE_PARAMETER_SCHEMA,
        OCTAVE_PIXELATE_SCHEMA,
        PARAMETER_SCHEMA,
        POST_BLEND_MODES,
        POST_PARAMETER_SCHEMA,
        type ParameterKey,
        type RenderOptions,
        type GpuTimingStats,
    } from '$lib/renderer';
    import { selectRenderBackend, type RenderBackend } from '$lib/render-backend';
    import {
        CursorInteractionTelemetry,
        GpuTelemetry,
        type CursorInteractionRollingSummary,
        type FrameRollingSummary,
        type GpuRollingSummary,
    } from '$lib/telemetry';
    import {
        defaultShaderSettings,
        normalizeSavedSettings,
        resetSettingsTab,
        serializeShaderSettings,
        shaderSettings,
    } from '$lib/settings';
    import AdjustmentEditor from '$lib/AdjustmentEditor.svelte';
    import AddMenu from '$lib/AddMenu.svelte';
    import ParameterEditor from '$lib/ParameterEditor.svelte';
    import PipelineItem from '$lib/PipelineItem.svelte';
    import ColourEffectEditor from '$lib/ColourEffectEditor.svelte';
    import {
        isRgbColour,
        loadCubeAsset,
        RGB_COLOUR_KINDS,
        RGB_COLOUR_LABELS,
        type CubeLut,
        type RgbColourEffect,
        type RgbColourKind,
    } from '$lib/colour-effects';
    import {
        COLOUR_GRADE_KEYS,
        POST_KEYS,
        POST_KINDS,
        POST_LABELS,
        createColour,
        createPost,
        moveById,
        removeById,
        syncPipelineToggles,
        type ColourEffect,
        type PostEffect,
        type PostEffectKind,
    } from '$lib/pipeline';
    import { MAX_ADJUSTMENTS, newHslCurve, type Adjustment } from '$lib/adjustments';
    import { CURSOR_COMMON_SCHEMA, CURSOR_EFFECT_GROUPS } from '$lib/cursor-schema';
    import { CursorState } from '$lib/cursor';
    import { CursorDensityField } from '$lib/cursor-density-field';

    let canvas: HTMLCanvasElement;
    let renderer: RenderBackend | undefined;
    const cursorState = new CursorState();
    const cursorDensityField = new CursorDensityField();
    let densityPoints: { x: number; y: number; timeStamp: number }[] = [];
    const initialDefaults = defaultShaderSettings();
    let options: RenderOptions = $state({
        seed: initialDefaults.seed,
        dprCap: Number.POSITIVE_INFINITY,
        renderScale: 1,
        parameters: initialDefaults.parameters,
        colour: initialDefaults.colour,
        post: initialDefaults.post,
    });
    let colour: ColourEffect[] = $state(initialDefaults.colour);
    let post: PostEffect[] = $state(initialDefaults.post);
    let expanded = $state(new Set<string>());
    let paused = $state(false);
    let controlsOpen = $state(false);
    let telemetryOpen = $state(false);
    let ready = $state(false);
    let status = $state('Starting graphics…');
    let activeBackend = $state('');
    let backendWarnings: string[] = $state([]);
    let lutGeneration = 0;
    let frameStats: FrameRollingSummary | undefined = $state();
    let gpuStats: GpuTimingStats | null | undefined = $state();
    let gpuRolling: GpuRollingSummary | undefined = $state();
    let cursorCpuRolling: CursorInteractionRollingSummary | undefined = $state();
    let effectiveRenderScale = $state(1);
    const gpuTelemetry = new GpuTelemetry();
    const cursorCpuTelemetry = new CursorInteractionTelemetry();
    const number = (value: number | undefined) => (value === undefined ? '…' : value.toFixed(1));
    const parameterTabs = [
        { id: 'field', label: 'Field' },
        { id: 'cursor', label: 'Cursor' },
        { id: 'adjustments', label: 'Colour' },
        { id: 'post', label: 'Post' },
        { id: 'octaves', label: 'Octaves' },
    ] as const;
    let selectedTabId: (typeof parameterTabs)[number]['id'] = $state('field');
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
        options = { ...options, parameters, colour, post };
        options.parameters = syncPipelineToggles(options.parameters, colour, post);
        shaderSettings.set({ seed: options.seed, parameters: options.parameters, colour, post });
        renderer?.setOptions(options);
        void resolveLuts();
    }
    async function resolveLuts() {
        const generation = ++lutGeneration;
        const items = colour.filter(
            (x): x is RgbColourEffect => isRgbColour(x) && x.type === 'lut' && x.enabled && Boolean(x.assetId),
        );
        const loaded = await Promise.all(
            items.map(async (item) => [item.assetId!, await loadCubeAsset(item.assetId!)] as const),
        );
        if (generation !== lutGeneration) return;
        const lutAssets: Record<string, CubeLut> = {};
        for (const [id, asset] of loaded) if (asset) lutAssets[id] = asset;
        colour = colour.map((item) =>
            isRgbColour(item) && item.type === 'lut' && item.assetId
                ? { ...item, missing: !lutAssets[item.assetId] }
                : item,
        );
        options = { ...options, colour, lutAssets };
        renderer?.setOptions(options);
    }
    function togglePause() {
        paused = !paused;
        renderer?.setPaused(paused);
    }
    function sendCursor() {
        renderer?.setCursorState(cursorState);
    }
    function resetDensityStroke() {
        densityPoints = [];
        cursorDensityField.endStroke(false);
        renderer?.resetCursorDensityStroke?.();
    }
    function resizeCursorDensity(rect: DOMRect) {
        if (renderer?.backend === 'webgpu') return;
        if (cursorDensityField.resize(rect.width, rect.height))
            renderer?.setCursorDensityField?.(cursorDensityField.snapshot());
    }
    function pointerMove(event: PointerEvent, depositDensity = true) {
        const samples = event.getCoalescedEvents?.() ?? [event],
            rect = canvas.getBoundingClientRect();
        resizeCursorDensity(rect);
        for (const sample of samples) {
            cursorState.update(sample.clientX, sample.clientY, rect, sample.timeStamp, true);
            if (
                depositDensity &&
                options.parameters.cursorEnabled !== 0 &&
                options.parameters.cursorDensityPressureEnabled !== 0
            ) {
                densityPoints.push({ x: cursorState.x, y: cursorState.y, timeStamp: sample.timeStamp });
            } else if (depositDensity) {
                resetDensityStroke();
            }
        }
        sendCursor();
    }
    function pointerDown(event: PointerEvent) {
        pointerMove(event, false);
        cursorState.pointerDown();
        sendCursor();
    }
    function pointerUp(event: PointerEvent) {
        cursorState.pointerUp();
        sendCursor();
    }
    function pointerLeave() {
        resetDensityStroke();
        cursorState.leave();
        sendCursor();
    }
    function randomize() {
        options.seed = Math.random() * 1000;
        update();
    }
    function resetDefaults() {
        const reset = resetSettingsTab(
            { seed: options.seed, parameters: options.parameters, colour, post },
            selectedTabId,
        );
        options = {
            ...options,
            parameters: reset.parameters,
            colour: reset.colour,
            post: reset.post,
        };
        colour = reset.colour;
        post = reset.post;
        update();
    }
    function exportSettings() {
        const json = serializeShaderSettings({
            seed: options.seed,
            parameters: options.parameters,
            colour,
            post,
        });
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'shaderdemo-settings.json';
        link.click();
        URL.revokeObjectURL(url);
    }
    const colourLabel = (item: ColourEffect) =>
        item.type === 'curve'
            ? 'Curve'
            : item.type === 'levels'
              ? 'Levels'
              : item.type === 'hsl'
                ? 'Hue / saturation / lightness'
                : isRgbColour(item)
                  ? RGB_COLOUR_LABELS[item.type]
                  : 'Colour grade';
    const schemaFor = (keys: readonly ParameterKey[]) =>
        POST_PARAMETER_SCHEMA.filter((entry) => keys.includes(entry.key));
    function setExpanded(id: string, value = !expanded.has(id)) {
        const next = new Set(expanded);
        value ? next.add(id) : next.delete(id);
        expanded = next;
    }
    function isScalarColour(item: ColourEffect): item is Adjustment {
        return item.type === 'curve' || item.type === 'levels' || item.type === 'hsl';
    }

    function changeColour(next: ColourEffect[]) {
        // The generated scene is scalar until the first RGB-native effect. Keep the legacy
        // Curve/Levels/HSL run before that materialization boundary; everything on either side
        // remains freely reorderable and Colour grade stays the final output transform.
        colour = [
            ...next.filter(isScalarColour),
            ...next.filter((item) => !isScalarColour(item) && item.type !== 'colour-grade'),
            ...next.filter((item) => item.type === 'colour-grade').slice(0, 1),
        ];
        update();
    }
    function addColour(type: string) {
        if (type === 'colour-grade') {
            if (colour.some((item) => item.type === type)) return;
            const item: ColourEffect = { id: `colour:colour-grade:0`, type, enabled: true };
            changeColour([...colour, item]);
            setExpanded(item.id, true);
            return;
        }
        if (
            ['curve', 'levels', 'hsl'].includes(type) &&
            colour.filter((item) => ['curve', 'levels', 'hsl'].includes(item.type)).length >= MAX_ADJUSTMENTS
        )
            return;
        const item = createColour(type as 'curve' | 'levels' | 'hsl' | RgbColourKind);
        changeColour([
            ...colour.filter((x) => x.type !== 'colour-grade'),
            item,
            ...colour.filter((x) => x.type === 'colour-grade'),
        ]);
        setExpanded(item.id, true);
    }
    function changePost(next: PostEffect[]) {
        post = next;
        update();
    }
    function addPost(type: string) {
        if (post.some((item) => item.type === type)) return;
        const item = createPost(type as PostEffectKind, post);
        changePost([...post, item]);
        setExpanded(item.id, true);
    }
    function setParameter(key: ParameterKey, value: number) {
        if ((key === 'cursorEnabled' || key === 'cursorDensityPressureEnabled') && value === 0) resetDensityStroke();
        options = { ...options, parameters: { ...options.parameters, [key]: value } };
        update();
    }
    function resetParameters(keys: readonly ParameterKey[]) {
        const parameters = { ...options.parameters };
        for (const key of keys) parameters[key] = PARAMETER_SCHEMA.find((entry) => entry.key === key)!.default;
        options = { ...options, parameters };
    }
    onMount(() => {
        let disposed = false;
        const isIos =
            /iPhone|iPad|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (isIos) canvas.classList.add('ios-overscan');
        // Mounting the persistent atom synchronously hydrates it from localStorage.
        let persisted = shaderSettings.get();
        const stopHydration = shaderSettings.subscribe((value) => (persisted = value));
        stopHydration();
        const saved = normalizeSavedSettings(persisted);
        colour = saved.colour;
        post = saved.post;
        options = {
            ...options,
            seed: saved.seed,
            parameters: saved.parameters,
            colour: saved.colour,
            post,
        };
        void resolveLuts();
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) paused = true;
        selectRenderBackend(canvas, options)
            .then(({ renderer: instance, warnings }) => {
                if (disposed) return instance.destroy();
                renderer = instance;
                instance.setCursorState(cursorState);
                const rect = canvas.getBoundingClientRect();
                if (instance.backend === 'webgl2') {
                    cursorDensityField.resize(rect.width, rect.height);
                    instance.setCursorDensityField(cursorDensityField.snapshot());
                }
                backendWarnings = [
                    ...warnings,
                    ...(instance.unsupportedEffects?.length
                        ? [`Unavailable in WebGL2: ${instance.unsupportedEffects.join(', ')}`]
                        : []),
                ];
                instance.onStats = (_value, _width, _height, rolling, renderScale) => {
                    frameStats = rolling;
                    cursorCpuRolling = cursorCpuTelemetry.summary(performance.now());
                    if (renderScale !== undefined) effectiveRenderScale = renderScale;
                };
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
                activeBackend = instance.backend.toUpperCase();
                status = activeBackend;
                instance.onLost = (message) => (status = message);
            })
            .catch((error) => {
                if (!disposed) status = error instanceof Error ? error.message : String(error);
            });
        let cursorFrame = 0,
            cursorTime = performance.now();
        const animateCursor = (now: number) => {
            if (!document.hidden) {
                const totalStart = performance.now();
                const dt = (now - cursorTime) / 1000;
                if (!paused) {
                    cursorState.tick(dt);
                    sendCursor();
                }
                const rect = canvas.getBoundingClientRect();
                resizeCursorDensity(rect);
                const inputStart = performance.now();
                const batch = densityPoints;
                const pointCount = batch.length;
                densityPoints = [];
                const inputMs = performance.now() - inputStart;
                const rasterStart = performance.now();
                const gpuPath = renderer?.backend === 'webgpu';
                const painted = gpuPath
                    ? false
                    : cursorDensityField.addStrokeBatch(
                          batch,
                          options.parameters.cursorDensityRadius,
                          options.parameters.cursorDensityPressureFalloff,
                          options.parameters.cursorDensityBuildUp,
                      );
                const rasterMs = performance.now() - rasterStart;
                const decayStart = performance.now();
                const densityTick = gpuPath
                    ? { changed: false, active: false }
                    : cursorDensityField.tick(dt, options.parameters.cursorDensityDecay);
                const decayMs = performance.now() - decayStart;
                const uploadStart = performance.now();
                if (painted || densityTick.changed) renderer?.setCursorDensityField?.(cursorDensityField.snapshot());
                renderer?.queueCursorDensityUpdate?.({
                    points: batch,
                    cssWidth: rect.width,
                    cssHeight: rect.height,
                    dt,
                    radius: options.parameters.cursorDensityRadius,
                    falloff: options.parameters.cursorDensityPressureFalloff,
                    buildUpSeconds: options.parameters.cursorDensityBuildUp,
                    decayRate: options.parameters.cursorDensityDecay,
                });
                const uploadSubmitMs = performance.now() - uploadStart;
                if (!gpuPath) {
                    const snapshot = cursorDensityField.snapshot();
                    cursorCpuTelemetry.record(now, {
                        inputMs,
                        rasterMs,
                        decayMs,
                        uploadSubmitMs,
                        totalMs: performance.now() - totalStart,
                        pointCount,
                        width: snapshot.width,
                        height: snapshot.height,
                    });
                }
            }
            cursorTime = now;
            cursorFrame = requestAnimationFrame(animateCursor);
        };
        cursorFrame = requestAnimationFrame(animateCursor);
        const visibility = () => {
            renderer?.setPaused(document.hidden || paused);
            if (document.hidden) {
                resetDensityStroke();
                cursorState.leave();
                sendCursor();
            }
            cursorTime = performance.now();
        };
        document.addEventListener('visibilitychange', visibility);
        const isInterfaceEvent = (event: Event) =>
            event.target instanceof Element && Boolean(event.target.closest('nav, .telemetry'));
        const move = (event: PointerEvent) => {
            if (!isInterfaceEvent(event)) pointerMove(event);
        };
        const down = (event: PointerEvent) => {
            if (!isInterfaceEvent(event)) pointerDown(event);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerdown', down);
        window.addEventListener('pointerup', pointerUp);
        window.addEventListener('pointercancel', pointerLeave);
        window.addEventListener('blur', pointerLeave);
        return () => {
            disposed = true;
            resetDensityStroke();
            document.removeEventListener('visibilitychange', visibility);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerdown', down);
            window.removeEventListener('pointerup', pointerUp);
            window.removeEventListener('pointercancel', pointerLeave);
            window.removeEventListener('blur', pointerLeave);
            cancelAnimationFrame(cursorFrame);
            renderer?.destroy();
        };
    });
</script>

<svelte:head
    ><title>Noise Field — GPU</title><meta
        name="description"
        content="A coloured, animated noise field composited transparently over a readable article."
    /></svelte:head
>

<canvas class:ready bind:this={canvas} aria-label="Animated coloured noise field layered transparently over the article"
></canvas>
<main>
    <article>
        <header>
            <h1>The quiet architecture of a city after rain</h1>
            <p class="dek">What puddles, late buses and lit windows reveal when the streets briefly slow down.</p>
            <p class="byline">By Mara Vale · <time datetime="2026-07-13">13 July 2026</time></p>
        </header>
        <p>
            Rain changes a city twice. First it alters the surface: stone darkens, traffic softens and every lamp
            acquires a wavering reflection. Then it changes the pace. People wait beneath awnings, choose longer routes
            with better shelter and notice buildings they ordinarily pass without looking.
        </p>
        <p>
            On a wet evening, the familiar grid becomes less certain. A shallow gutter can hold a second skyline; a bus
            shelter can feel like a public room. These small inversions make the street legible again—not as
            infrastructure, but as a collection of choices made over decades.
        </p>
        <h2>Reading the reflected street</h2>
        <p>
            The most vivid details are temporary. Painted signs sharpen against damp brick, leaves stick to the pavement
            in bright constellations, and old repairs appear as darker seams. The effect rewards walking slowly and
            looking down as often as up.
        </p>
        <blockquote>
            “A reflection does not copy the street. It edits the street, keeping the light and letting the rest fall
            away.”
        </blockquote>
        <p>Three habits make these evenings especially revealing:</p>
        <ul>
            <li>Follow a familiar route at half your usual speed.</li>
            <li>Notice where strangers naturally gather under cover.</li>
            <li>Compare the colour of reflected light with its source.</li>
        </ul>
        <p>
            The walk need not become a project. A short detour and a few attentive minutes are enough. The
            <a href="https://en.wikipedia.org/wiki/Fl%C3%A2neur">tradition of urban wandering</a> can sound grand; in practice,
            it begins by leaving a little time unplanned.
        </p>
        <h2>A temporary common room</h2>
        <p>
            Weather also exposes the social shape of a place. The generous arcade, the deep doorway and the tree dense
            enough to stop a shower all become shared assets. Their value is felt directly, without a map or sign
            explaining it.
        </p>
        <p>
            By morning, most evidence has evaporated. What remains is a better memory of the street: where it welcomes a
            pause, where it pushes people onward, and where a patch of colour can make the ordinary briefly strange. For
            more walks and field notes, visit the
            <a href="https://www.openstreetmap.org/">open map</a> and choose somewhere nearby that you have never crossed
            on foot.
        </p>
    </article>
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
                    {activeBackend}<br />
                    {#if paused}
                        FPS paused/reset<br />frame RMS paused/reset
                    {:else}
                        FPS .5s {number(frameStats?.windows[500]?.fps)} · 2s {number(frameStats?.windows[2000]?.fps)} · 10s
                        {number(frameStats?.windows[10000]?.fps)}<br />frame RMS {number(frameStats?.rms2sMs)}ms ·
                        render
                        {effectiveRenderScale.toFixed(2)}×
                    {/if}<br />
                    {#if gpuStats === null}
                        GPU timing unavailable
                    {:else if gpuRolling}
                        GPU 1s {number(gpuRolling.windows[1000]?.totalMs)} · 5s {number(
                            gpuRolling.windows[5000]?.totalMs,
                        )} · 30s
                        {number(gpuRolling.windows[30000]?.totalMs)}ms · RMS {number(gpuRolling.rms5sMs)}<br />
                        field {number(gpuRolling.windows[5000]?.fieldMs)} · colour {number(
                            gpuRolling.windows[5000]?.colourMs,
                        )} · post {number(gpuRolling.windows[5000]?.postMs)} · octaves {number(
                            gpuRolling.windows[5000]?.octavesMs,
                        )} · cursor {number(gpuRolling.windows[5000]?.cursorMs)} · present {number(
                            gpuRolling.windows[5000]?.presentMs,
                        )}
                        {#if gpuRolling.perPass5s.length}
                            <details class="per-effect-timings">
                                <summary>Per-effect timings</summary>
                                <ul>
                                    {#each gpuRolling.perPass5s as pass}
                                        <li><span>{pass.label}</span><span>{number(pass.ms)}ms</span></li>
                                    {/each}
                                </ul>
                            </details>
                        {/if}
                        <details class="per-effect-timings cursor-interaction-timings">
                            <summary>Cursor interaction (CPU)</summary>
                            <ul>
                                <li>
                                    <span>INPUT / BATCH</span><span
                                        >{number(cursorCpuRolling?.windows[5000]?.inputMs)}ms</span
                                    >
                                </li>
                                <li>
                                    <span>RASTER (spline / max)</span><span
                                        >{number(cursorCpuRolling?.windows[5000]?.rasterMs)}ms</span
                                    >
                                </li>
                                <li>
                                    <span>DECAY</span><span>{number(cursorCpuRolling?.windows[5000]?.decayMs)}ms</span>
                                </li>
                                <li>
                                    <span>UPLOAD / SUBMIT (CPU)</span><span
                                        >{number(cursorCpuRolling?.windows[5000]?.uploadSubmitMs)}ms</span
                                    >
                                </li>
                                <li>
                                    <span>TOTAL 1s / 5s / 30s</span><span
                                        >{number(cursorCpuRolling?.windows[1000]?.totalMs)} / {number(
                                            cursorCpuRolling?.windows[5000]?.totalMs,
                                        )} / {number(cursorCpuRolling?.windows[30000]?.totalMs)}ms</span
                                    >
                                </li>
                                <li><span>TOTAL RMS 5s</span><span>{number(cursorCpuRolling?.rms5sMs)}ms</span></li>
                                <li>
                                    <span>Latest batch</span><span
                                        >{cursorCpuRolling?.latest?.pointCount ?? 0} points</span
                                    >
                                </li>
                                <li>
                                    <span>Density upload</span><span
                                        >{cursorCpuRolling?.latest?.width ?? 0}×{cursorCpuRolling?.latest?.height ?? 0} R8</span
                                    >
                                </li>
                                <li><span>CURSOR GPU</span><span>INCLUDED IN FIELD</span></li>
                            </ul>
                            <small
                                >Cursor density is sampled inline by Field. Upload / submit is CPU call time, not GPU
                                completion.</small
                            >
                        </details>
                    {:else}
                        GPU timing…
                    {/if}
                    {#if backendWarnings.length}<br />Fallback: {backendWarnings.join(' · ')}{/if}
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
                <button onclick={exportSettings}>Export settings</button>
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
                                                    {#each FIELD_BLEND_MODES as label, value}
                                                        <option {value}>{label}</option>
                                                    {/each}
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
                    {:else if selectedTabId === 'cursor'}
                        <div
                            class="sliders cursor-panel"
                            id="panel-cursor"
                            role="tabpanel"
                            aria-labelledby="tab-cursor"
                        >
                            <section class="cursor-common">
                                {#each CURSOR_COMMON_SCHEMA as parameter}
                                    {#if parameter.step === 1 && parameter.max === 1}
                                        <label class="enabled"
                                            ><span>{parameter.label}</span><input
                                                type="checkbox"
                                                checked={options.parameters[parameter.key] >= 0.5}
                                                onchange={(e) =>
                                                    setParameter(parameter.key, e.currentTarget.checked ? 1 : 0)}
                                            /></label
                                        >
                                    {:else}
                                        <label class="parameter"
                                            ><span>{parameter.label}</span><input
                                                class="exact-value"
                                                aria-label={`${parameter.label} exact value`}
                                                type="number"
                                                min={parameter.min}
                                                max={parameter.max}
                                                step={parameter.step}
                                                value={options.parameters[parameter.key]}
                                                onchange={(e) =>
                                                    setParameter(parameter.key, e.currentTarget.valueAsNumber)}
                                            /><input
                                                type="range"
                                                min={parameter.min}
                                                max={parameter.max}
                                                step={parameter.step}
                                                value={options.parameters[parameter.key]}
                                                oninput={(e) =>
                                                    setParameter(parameter.key, e.currentTarget.valueAsNumber)}
                                            /></label
                                        >
                                    {/if}
                                {/each}
                            </section>
                            {#each CURSOR_EFFECT_GROUPS as [label, toggle, parameters]}
                                <details class="cursor-effect">
                                    <summary
                                        ><label class="enabled"
                                            ><input
                                                type="checkbox"
                                                onclick={(e) => e.stopPropagation()}
                                                checked={options.parameters[toggle] >= 0.5}
                                                onchange={(e) => setParameter(toggle, e.currentTarget.checked ? 1 : 0)}
                                            /><span>{label}</span></label
                                        ></summary
                                    >
                                    {#each parameters as parameter}
                                        <label class="parameter"
                                            ><span>{parameter.label}</span><input
                                                class="exact-value"
                                                aria-label={`${label} ${parameter.label} exact value`}
                                                type="number"
                                                min={parameter.min}
                                                max={parameter.max}
                                                step={parameter.step}
                                                value={options.parameters[parameter.key]}
                                                onchange={(e) =>
                                                    setParameter(parameter.key, e.currentTarget.valueAsNumber)}
                                            /><input
                                                type="range"
                                                min={parameter.min}
                                                max={parameter.max}
                                                step={parameter.step}
                                                value={options.parameters[parameter.key]}
                                                oninput={(e) =>
                                                    setParameter(parameter.key, e.currentTarget.valueAsNumber)}
                                            /></label
                                        >
                                    {/each}
                                </details>
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
                    {:else if selectedTabId === 'adjustments'}
                        <div class="sliders" id="panel-adjustments" role="tabpanel" aria-labelledby="tab-adjustments">
                            <AddMenu
                                label="Add colour effect"
                                choices={[
                                    {
                                        id: 'curve',
                                        label: 'Curve',
                                        disabled:
                                            colour.length - (colour.some((x) => x.type === 'colour-grade') ? 1 : 0) >=
                                            MAX_ADJUSTMENTS,
                                    },
                                    {
                                        id: 'levels',
                                        label: 'Levels',
                                        disabled:
                                            colour.length - (colour.some((x) => x.type === 'colour-grade') ? 1 : 0) >=
                                            MAX_ADJUSTMENTS,
                                    },
                                    {
                                        id: 'hsl',
                                        label: 'Hue / saturation / lightness',
                                        disabled:
                                            colour.length - (colour.some((x) => x.type === 'colour-grade') ? 1 : 0) >=
                                            MAX_ADJUSTMENTS,
                                    },
                                    {
                                        id: 'colour-grade',
                                        label: 'Colour grade',
                                        disabled: colour.some((x) => x.type === 'colour-grade'),
                                    },
                                    ...RGB_COLOUR_KINDS.map((type) => ({ id: type, label: RGB_COLOUR_LABELS[type] })),
                                ]}
                                onselect={addColour}
                            />
                            {#each colour as item, index (item.id)}
                                <PipelineItem
                                    id={item.id}
                                    name={colourLabel(item)}
                                    enabled={item.enabled}
                                    expanded={expanded.has(item.id)}
                                    moveUpDisabled={index === 0 || item.type === 'colour-grade'}
                                    moveDownDisabled={index === colour.length - 1 ||
                                        item.type === 'colour-grade' ||
                                        colour[index + 1]?.type === 'colour-grade'}
                                    onexpand={() => setExpanded(item.id)}
                                    onenabled={(enabled) =>
                                        changeColour(colour.map((x) => (x.id === item.id ? { ...x, enabled } : x)))}
                                    onmove={(delta) => changeColour(moveById(colour, item.id, delta))}
                                    onreset={() => {
                                        if (item.type === 'colour-grade') resetParameters(COLOUR_GRADE_KEYS);
                                        else
                                            changeColour(
                                                colour.map((x) =>
                                                    x.id === item.id
                                                        ? {
                                                              ...(item.type === 'curve' && item.mode === 'hsl'
                                                                  ? newHslCurve()
                                                                  : createColour(item.type)),
                                                              id: item.id,
                                                          }
                                                        : x,
                                                ),
                                            );
                                        update();
                                    }}
                                    onremove={() => changeColour(removeById(colour, item.id))}
                                >
                                    {#if item.type === 'colour-grade'}
                                        <ParameterEditor
                                            parameters={options.parameters}
                                            schema={schemaFor(COLOUR_GRADE_KEYS)}
                                            onchange={setParameter}
                                        />
                                    {:else if isRgbColour(item)}
                                        <ColourEffectEditor
                                            effect={item}
                                            onchange={(value) =>
                                                changeColour(colour.map((x) => (x.id === item.id ? value : x)))}
                                        />
                                    {:else}
                                        <AdjustmentEditor
                                            adjustment={item}
                                            onchange={(value) =>
                                                changeColour(colour.map((x) => (x.id === item.id ? value : x)))}
                                        />
                                    {/if}
                                </PipelineItem>
                            {/each}
                            {#if colour.length === 0}<p class="empty">No colour effects.</p>{/if}
                        </div>
                    {:else}
                        <div class="sliders" id="panel-post" role="tabpanel" aria-labelledby="tab-post">
                            <AddMenu
                                label="Add post effect"
                                choices={POST_KINDS.map((type) => ({
                                    id: type,
                                    label: POST_LABELS[type],
                                    disabled: post.some((x) => x.type === type),
                                }))}
                                onselect={addPost}
                            />
                            {#each post as item, index (item.id)}
                                <PipelineItem
                                    id={item.id}
                                    name={POST_LABELS[item.type]}
                                    enabled={item.enabled}
                                    expanded={expanded.has(item.id)}
                                    moveUpDisabled={index === 0}
                                    moveDownDisabled={index === post.length - 1}
                                    onexpand={() => setExpanded(item.id)}
                                    onenabled={(enabled) => {
                                        post = post.map((x) => (x.id === item.id ? { ...x, enabled } : x));
                                        update();
                                    }}
                                    onmove={(delta) => changePost(moveById(post, item.id, delta))}
                                    onreset={() => {
                                        resetParameters(POST_KEYS[item.type]);
                                        update();
                                    }}
                                    onremove={() => changePost(removeById(post, item.id))}
                                >
                                    <ParameterEditor
                                        parameters={options.parameters}
                                        schema={schemaFor(POST_KEYS[item.type])}
                                        onchange={setParameter}
                                    />
                                </PipelineItem>
                            {/each}
                            {#if post.length === 0}<p class="empty">No post effects.</p>{/if}
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
        min-height: 100%;
        background: transparent;
        color: #e9e7e1;
    }
    :global(body) {
        font-family: Georgia, 'Times New Roman', serif;
    }
    main {
        position: relative;
        min-height: 100vh;
        background: #070809;
    }
    canvas {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 1;
        display: block;
        width: 100%;
        height: 100%;
        width: 100lvw;
        height: 100lvh;
        pointer-events: none;
        opacity: 0;
        background: transparent;
    }
    canvas.ready {
        opacity: 1;
        transition: opacity 0.35s ease;
    }
    :global(canvas.ios-overscan) {
        top: -25lvh;
        left: -25lvw;
        width: 150lvw;
        height: 150lvh;
    }

    article {
        position: relative;
        z-index: 0;
        width: min(100% - 40px, 700px);
        margin: 0 auto;
        padding: clamp(72px, 12vw, 150px) 0 140px;
        font-size: clamp(18px, 1.8vw, 21px);
        line-height: 1.68;
    }
    article header {
        margin-bottom: 3.5rem;
    }
    article h1,
    article h2 {
        color: #f5f2ea;
        font-weight: 500;
        line-height: 1.06;
        text-wrap: balance;
    }
    article h1 {
        max-width: 13ch;
        margin: 0 0 1.4rem;
        font-size: clamp(46px, 8vw, 88px);
        letter-spacing: -0.045em;
    }
    article h2 {
        margin: 3.5rem 0 1rem;
        font-size: clamp(30px, 4vw, 42px);
        letter-spacing: -0.025em;
    }
    article p {
        margin: 0 0 1.45em;
    }
    article .dek {
        max-width: 35em;
        margin-bottom: 1rem;
        color: #c9c6bf;
        font-size: 1.25em;
        line-height: 1.4;
    }
    article .byline {
        color: #9b9993;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.65em;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }
    article blockquote {
        margin: 2.5rem 0;
        padding-left: 1.3em;
        border-left: 1px solid #a8a49a;
        color: #f4f0e7;
        font-size: 1.35em;
        font-style: italic;
        line-height: 1.45;
    }
    article ul {
        margin: 0 0 1.8em;
        padding-left: 1.3em;
    }
    article li {
        margin: 0.35em 0;
        padding-left: 0.3em;
    }
    article a {
        color: #f3eee1;
        text-decoration-color: #aaa69b;
        text-underline-offset: 0.18em;
    }
    article a:hover,
    article a:focus-visible {
        color: #fff;
        text-decoration-thickness: 2px;
    }
    .telemetry {
        position: fixed;
        left: 14px;
        bottom: 12px;
        z-index: 3;
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
    .per-effect-timings ul {
        margin: 4px 0 0;
        padding: 0;
        list-style: none;
    }
    .per-effect-timings li {
        display: flex;
        justify-content: space-between;
        gap: 16px;
    }
    nav {
        position: fixed;
        top: 14px;
        right: 14px;
        z-index: 3;
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
        grid-template-columns: repeat(5, 1fr);
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
    .cursor-common,
    .cursor-effect {
        padding: 7px 0;
        border-bottom: 1px solid #ffffff20;
    }
    .cursor-common {
        display: grid;
        gap: 7px;
    }
    .cursor-effect summary {
        color: #aaa;
        cursor: pointer;
    }
    .cursor-effect summary::marker {
        color: #666;
    }
    .cursor-effect[open] {
        display: grid;
        gap: 7px;
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
        z-index: 3;
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
        article {
            width: min(100% - 32px, 700px);
            padding-top: 92px;
        }
        article header {
            margin-bottom: 2.5rem;
        }
        .controls {
            max-width: calc(100vw - 58px);
            flex-wrap: wrap;
            justify-content: flex-end;
        }
    }
</style>
