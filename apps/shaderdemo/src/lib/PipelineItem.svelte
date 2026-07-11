<script lang="ts">
    import type { Snippet } from 'svelte';
    let {
        id,
        name,
        enabled,
        expanded,
        moveUpDisabled,
        moveDownDisabled,
        onexpand,
        onenabled,
        onmove,
        onreset,
        onremove,
        children,
    }: {
        id: string;
        name: string;
        enabled: boolean;
        expanded: boolean;
        moveUpDisabled: boolean;
        moveDownDisabled: boolean;
        onexpand: () => void;
        onenabled: (enabled: boolean) => void;
        onmove: (delta: number) => void;
        onreset: () => void;
        onremove: () => void;
        children: Snippet;
    } = $props();

    function confirmReset() {
        if (confirm(`Reset ${name} to its defaults?`)) onreset();
    }
    function confirmRemove() {
        if (confirm(`Remove ${name}?`)) onremove();
    }
</script>

<section class="pipeline-item">
    <header>
        <button class="disclosure" aria-expanded={expanded} aria-controls={`pipeline-${id}`} onclick={onexpand}
            ><span aria-hidden="true">{expanded ? '▾' : '▸'}</span> {name}</button
        >
        <div class="header-actions">
            <button aria-label={`Move ${name} up`} disabled={moveUpDisabled} onclick={() => onmove(-1)}>↑</button>
            <button aria-label={`Move ${name} down`} disabled={moveDownDisabled} onclick={() => onmove(1)}>↓</button>
            <label title={enabled ? `Disable ${name}` : `Enable ${name}`}>
                <span class="sr-only">Enabled</span>
                <input type="checkbox" checked={enabled} onchange={(event) => onenabled(event.currentTarget.checked)} />
            </label>
        </div>
    </header>
    {#if expanded}
        <div class="body" id={`pipeline-${id}`}>
            {@render children()}
            <div class="item-actions">
                <button onclick={confirmReset}>Reset</button><button onclick={confirmRemove}>Remove</button>
            </div>
        </div>
    {/if}
</section>

<style>
    .pipeline-item {
        padding: 6px 0 8px;
        border-top: 1px solid #ffffff20;
    }
    header,
    .header-actions,
    .item-actions {
        display: flex;
        align-items: center;
    }
    header {
        justify-content: space-between;
        gap: 4px;
    }
    .header-actions {
        gap: 1px;
    }
    .header-actions button {
        padding: 3px 4px !important;
    }
    button:disabled {
        opacity: 0.25;
        cursor: default;
    }
    .disclosure {
        min-width: 0;
        padding-left: 2px !important;
        overflow: hidden;
        text-align: left;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    label {
        padding: 2px;
    }
    .body {
        display: grid;
        gap: 7px;
        padding: 7px 2px 0;
    }
    .item-actions {
        justify-content: flex-end;
        gap: 4px;
        padding-top: 2px;
    }
    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
    }
</style>
