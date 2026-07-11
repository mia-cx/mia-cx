<script lang="ts">
    interface MenuChoice {
        id: string;
        label: string;
        disabled?: boolean;
    }
    let { label, choices, onselect }: { label: string; choices: MenuChoice[]; onselect: (id: string) => void } =
        $props();
    let open = $state(false);
    let trigger: HTMLButtonElement;
    let menu = $state<HTMLDivElement>();

    function close(focusTrigger = false) {
        open = false;
        if (focusTrigger) requestAnimationFrame(() => trigger.focus());
    }
    function keydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.preventDefault();
            close(true);
        }
    }
    function choose(id: string) {
        onselect(id);
        close(true);
    }
    $effect(() => {
        if (open) requestAnimationFrame(() => menu?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());
    });
</script>

<svelte:window
    onkeydown={keydown}
    onclick={(event) => {
        if (open && !menu?.contains(event.target as Node) && event.target !== trigger) close();
    }}
/>
<div class="add-menu">
    <button
        bind:this={trigger}
        class="add"
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onclick={() => (open = !open)}>+</button
    >
    {#if open}
        <div bind:this={menu} class="menu" role="menu" aria-label={label}>
            {#each choices as choice}
                <button role="menuitem" type="button" disabled={choice.disabled} onclick={() => choose(choice.id)}
                    >{choice.label}</button
                >
            {/each}
        </div>
    {/if}
</div>

<style>
    .add-menu {
        position: relative;
        display: flex;
        justify-content: flex-end;
        padding: 2px 0 5px;
    }
    .add {
        width: 24px;
        height: 24px;
        padding: 0 !important;
        font-size: 15px !important;
    }
    .menu {
        position: absolute;
        z-index: 3;
        top: 27px;
        right: 0;
        display: grid;
        min-width: 180px;
        padding: 3px;
        border: 1px solid #ffffff2b;
        background: #090909;
        box-shadow: 0 5px 15px #000a;
    }
    .menu button {
        padding: 6px 8px !important;
        text-align: left;
        white-space: nowrap;
    }
    .menu button:disabled {
        opacity: 0.35;
        cursor: default;
    }
</style>
