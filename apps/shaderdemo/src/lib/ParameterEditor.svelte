<script lang="ts">
    import { POST_BLEND_MODES, type ParameterKey, type ShaderParameters } from './renderer';
    type SchemaEntry = { key: ParameterKey; label: string; min: number; max: number; step: number; default: number };
    let {
        parameters,
        schema,
        onchange,
    }: {
        parameters: ShaderParameters;
        schema: readonly SchemaEntry[];
        onchange: (key: ParameterKey, value: number) => void;
    } = $props();
</script>

{#each schema as parameter}
    {#if parameter.key.endsWith('BlendMode')}
        <label class="blend-mode">
            <span>{parameter.label}</span>
            <select
                value={parameters[parameter.key]}
                onchange={(event) => onchange(parameter.key, +event.currentTarget.value)}
            >
                {#each POST_BLEND_MODES as label, value}<option {value}>{label}</option>{/each}
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
                value={parameters[parameter.key]}
                onchange={(event) => onchange(parameter.key, +event.currentTarget.value)}
            />
            <input
                aria-label={parameter.label}
                type="range"
                min={parameter.min}
                max={parameter.max}
                step={parameter.step}
                value={parameters[parameter.key]}
                oninput={(event) => onchange(parameter.key, +event.currentTarget.value)}
            />
        </label>
    {/if}
{/each}

<style>
    .parameter {
        display: grid;
        grid-template-columns: 1fr 62px;
        gap: 2px 7px;
        cursor: default;
        letter-spacing: 0.03em;
        text-transform: none;
    }
    .exact-value {
        width: 100%;
        min-width: 0;
        padding: 1px 2px;
        border: 0;
        border-bottom: 1px solid #ffffff24;
        background: transparent;
        color: #aaa;
        font: inherit;
        text-align: right;
    }
    input[type='range'] {
        grid-column: 1/-1;
        width: 100%;
        height: 10px;
        margin: 0;
        accent-color: #ddd;
    }
    .blend-mode {
        justify-content: space-between;
        text-transform: none;
        letter-spacing: 0.03em;
    }
    select {
        border: 0;
        border-bottom: 1px solid #ffffff24;
        background: #090909;
        color: #ddd;
        font: inherit;
    }
</style>
