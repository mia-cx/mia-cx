<script lang="ts">
    import {
        CHANNELS,
        curveLut,
        MAX_CURVE_POINTS,
        type Channel,
        type CurveChannels,
        type CurveEdit,
        type CurvePoint,
    } from './adjustments';
    export let points: CurvePoint[];
    export let channels: CurveChannels;
    export let channelMask: Channel[];
    export let onedit: (edit: CurveEdit) => void;
    let selectedX = 0;
    let graph: SVGSVGElement;
    $: selected = Math.max(
        0,
        points.findIndex((point) => point.x === selectedX),
    );
    $: channelPaths = Object.fromEntries(
        CHANNELS.map((channel) => [
            channel,
            Array.from(curveLut(channels[channel]), (y, x) => `${x},${255 - y}`).join(' '),
        ]),
    ) as Record<Channel, string>;
    $: primaryChannel = channelMask.length
        ? (CHANNELS.find((channel) => channels[channel] === points) ?? channelMask[0])
        : undefined;

    function commit(oldX: number, x: number, y: number) {
        if (channelMask.length === 0) return oldX;
        const nx = oldX === 0 || oldX === 255 ? oldX : Math.max(1, Math.min(254, Math.round(x)));
        const ny = Math.max(0, Math.min(255, Math.round(y)));
        onedit({ type: 'move', oldX, x: nx, y: ny });
        selectedX = nx;
        return nx;
    }
    function coordinates(event: PointerEvent) {
        const box = graph.getBoundingClientRect();
        return {
            x: ((event.clientX - box.left) * 255) / box.width,
            y: 255 - ((event.clientY - box.top) * 255) / box.height,
        };
    }
    function pointerdown(event: PointerEvent) {
        if (event.button !== 0 || channelMask.length === 0) return;
        const c = coordinates(event);
        const index = points.findIndex((p) => Math.hypot(p.x - c.x, p.y - c.y) < 9);
        let dragX: number;
        if (index < 0 && points.length < MAX_CURVE_POINTS) {
            const marker = {
                x: Math.max(1, Math.min(254, Math.round(c.x))),
                y: Math.max(0, Math.min(255, Math.round(c.y))),
            };
            if (points.some((p) => p.x === marker.x)) return;
            onedit({ type: 'add', ...marker });
            dragX = marker.x;
        } else if (index >= 0) dragX = points[index].x;
        else return;
        selectedX = dragX;
        graph.setPointerCapture(event.pointerId);
        const move = (e: PointerEvent) => {
            const at = coordinates(e);
            dragX = commit(dragX, at.x, at.y);
        };
        const cleanup = () => {
            graph.removeEventListener('pointermove', move);
            graph.removeEventListener('pointerup', finish);
            graph.removeEventListener('pointercancel', finish);
            graph.removeEventListener('lostpointercapture', cleanup);
        };
        const finish = (e: PointerEvent) => {
            cleanup();
            if (graph.hasPointerCapture(e.pointerId)) graph.releasePointerCapture(e.pointerId);
        };
        graph.addEventListener('pointermove', move);
        graph.addEventListener('pointerup', finish);
        graph.addEventListener('pointercancel', finish);
        graph.addEventListener('lostpointercapture', cleanup);
    }
    function removeSelected() {
        if (channelMask.length === 0 || selectedX === 0 || selectedX === 255) return;
        const index = points.findIndex((point) => point.x === selectedX);
        if (index < 0) return;
        onedit({ type: 'remove', x: selectedX });
        selectedX = points[Math.max(0, index - 1)].x;
    }
    function keydown(event: KeyboardEvent) {
        if (channelMask.length === 0) return;
        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            removeSelected();
            return;
        }
        if (!event.key.startsWith('Arrow')) return;
        event.preventDefault();
        const amount = event.shiftKey ? 10 : 1;
        const dx = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0;
        const dy = event.key === 'ArrowDown' ? -amount : event.key === 'ArrowUp' ? amount : 0;
        commit(selectedX, points[selected].x + dx, points[selected].y + dy);
    }
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex a11y-no-noninteractive-element-interactions -->
<svg
    bind:this={graph}
    class="curve"
    viewBox="0 0 255 255"
    role="application"
    aria-label="Curve editor"
    tabindex="0"
    class:inactive={channelMask.length === 0}
    onpointerdown={pointerdown}
    onkeydown={keydown}
>
    <rect width="255" height="255" />
    {#each [51, 102, 153, 204] as n}<path class="grid" d={`M${n} 0V255M0 ${n}H255`} />{/each}
    <path class="identity" d="M0 255L255 0" />
    {#each CHANNELS as channel}
        <polyline
            class="channel channel-{channel}"
            class:checked={channelMask.includes(channel)}
            class:primary={channel === primaryChannel}
            points={channelPaths[channel]}
        />
        {#if channel !== primaryChannel}
            {#each channels[channel] as point}
                <circle
                    class="channel-point channel-{channel}"
                    class:checked={channelMask.includes(channel)}
                    cx={point.x}
                    cy={255 - point.y}
                    r="2.5"
                />
            {/each}
        {/if}
    {/each}
    {#each points as point, index}
        <!-- Selection and keyboard editing are provided by the focusable graph. -->
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <circle
            class:selected={selected === index}
            cx={point.x}
            cy={255 - point.y}
            r="4"
            onclick={(event) => {
                event.stopPropagation();
                if (channelMask.length > 0) selectedX = point.x;
            }}
            ondblclick={(event) => {
                event.stopPropagation();
                selectedX = point.x;
                removeSelected();
            }}
            oncontextmenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (channelMask.length > 0 && point.x !== 0 && point.x !== 255) onedit({ type: 'remove', x: point.x });
            }}
        />
    {/each}
</svg>
<div class="coordinates">
    <label
        >X <input
            type="number"
            min="0"
            max="255"
            value={points[selected].x}
            disabled={channelMask.length === 0 || selected === 0 || selected === points.length - 1}
            onchange={(e) => commit(selectedX, +e.currentTarget.value, points[selected].y)}
        /></label
    >
    <label
        >Y <input
            type="number"
            min="0"
            max="255"
            value={points[selected].y}
            disabled={channelMask.length === 0}
            onchange={(e) => commit(selectedX, points[selected].x, +e.currentTarget.value)}
        /></label
    >
</div>

<style>
    .curve {
        display: block;
        width: 100%;
        aspect-ratio: 1;
        background: #111;
        touch-action: none;
        outline: 1px solid #ffffff2b;
    }
    rect {
        fill: #111;
    }
    .grid {
        stroke: #ffffff12;
        stroke-width: 1;
    }
    .identity {
        stroke: #ffffff35;
        stroke-width: 1;
    }
    .channel {
        fill: none;
        stroke-width: 1.5;
        opacity: 0.25;
    }
    .channel.checked {
        opacity: 0.85;
    }
    .channel.primary {
        stroke-width: 2.5;
        opacity: 1;
    }
    .channel-r {
        stroke: #ff5d5d;
    }
    .channel-g {
        stroke: #5dff81;
    }
    .channel-b {
        stroke: #6d8cff;
    }
    .channel-point {
        fill: #111;
        stroke-width: 1.5;
        opacity: 0.25;
        pointer-events: none;
    }
    .channel-point.checked {
        opacity: 0.85;
    }
    circle {
        fill: #111;
        stroke: #eee;
        stroke-width: 2;
        cursor: move;
    }
    circle.selected {
        fill: #eee;
        stroke: #111;
    }
    .curve.inactive circle {
        opacity: 0.25;
    }
    .coordinates {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding-top: 5px;
    }
    label {
        text-transform: none;
    }
    input {
        width: 54px;
        border: 0;
        border-bottom: 1px solid #ffffff24;
        background: transparent;
        color: #ddd;
        font: inherit;
        text-align: right;
    }
</style>
