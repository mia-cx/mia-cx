<script lang="ts">
    import { curveLut, MAX_CURVE_POINTS, type CurveEdit, type CurvePoint } from './adjustments';
    export let points: CurvePoint[];
    export let onedit: (edit: CurveEdit) => void;
    let selected = 0;
    let graph: SVGSVGElement;
    $: selected = Math.min(selected, points.length - 1);
    $: path = Array.from(curveLut(points), (y, x) => `${x},${255 - y}`).join(' ');

    function commit(index: number, x: number, y: number) {
        const old = points[index];
        const nx = index === 0 ? 0 : index === points.length - 1 ? 255 : Math.max(1, Math.min(254, Math.round(x)));
        const ny = Math.max(0, Math.min(255, Math.round(y)));
        onedit({ type: 'move', oldX: old.x, x: nx, y: ny });
        selected = points.filter((point) => point.x < nx && point.x !== old.x).length;
    }
    function coordinates(event: PointerEvent) {
        const box = graph.getBoundingClientRect();
        return {
            x: ((event.clientX - box.left) * 255) / box.width,
            y: 255 - ((event.clientY - box.top) * 255) / box.height,
        };
    }
    function pointerdown(event: PointerEvent) {
        const c = coordinates(event);
        let index = points.findIndex((p) => Math.hypot(p.x - c.x, p.y - c.y) < 9);
        if (index < 0 && points.length < MAX_CURVE_POINTS) {
            const marker = { x: Math.max(1, Math.min(254, Math.round(c.x))), y: Math.round(c.y) };
            if (points.some((p) => p.x === marker.x)) return;
            onedit({ type: 'add', ...marker });
            index = points.findIndex((point) => point.x === marker.x);
            selected = index < 0 ? points.filter((point) => point.x < marker.x).length : index;
        } else if (index >= 0) selected = index;
        if (index < 0) return;
        graph.setPointerCapture(event.pointerId);
        const move = (e: PointerEvent) => {
            const at = coordinates(e);
            commit(selected, at.x, at.y);
        };
        const up = () => {
            graph.removeEventListener('pointermove', move);
            graph.removeEventListener('pointerup', up);
        };
        graph.addEventListener('pointermove', move);
        graph.addEventListener('pointerup', up);
    }
    function removeSelected() {
        if (selected <= 0 || selected >= points.length - 1) return;
        onedit({ type: 'remove', x: points[selected].x });
        selected = Math.max(0, selected - 1);
    }
    function keydown(event: KeyboardEvent) {
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
        commit(selected, points[selected].x + dx, points[selected].y + dy);
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
    onpointerdown={pointerdown}
    onkeydown={keydown}
>
    <rect width="255" height="255" />
    {#each [51, 102, 153, 204] as n}<path class="grid" d={`M${n} 0V255M0 ${n}H255`} />{/each}
    <path class="identity" d="M0 255L255 0" />
    <polyline points={path} />
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
                selected = index;
            }}
            ondblclick={(event) => {
                event.stopPropagation();
                selected = index;
                removeSelected();
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
            disabled={selected === 0 || selected === points.length - 1}
            onchange={(e) => commit(selected, +e.currentTarget.value, points[selected].y)}
        /></label
    >
    <label
        >Y <input
            type="number"
            min="0"
            max="255"
            value={points[selected].y}
            onchange={(e) => commit(selected, points[selected].x, +e.currentTarget.value)}
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
    polyline {
        fill: none;
        stroke: #eee;
        stroke-width: 2;
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
