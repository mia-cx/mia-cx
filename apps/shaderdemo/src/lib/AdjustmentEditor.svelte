<script lang="ts">
    import CurveEditor from './CurveEditor.svelte';
    import { CHANNELS, setLevelsChannelValue, type Adjustment, type Channel, type LevelsKey } from './adjustments';
    let { adjustment, onchange }: { adjustment: Adjustment; onchange: (value: Adjustment) => void } = $props();
    let channel: Channel = $state('r');
    const rows = [
        ['inputLow', 'Input black', 0, 254, 1],
        ['inputHigh', 'Input white', 1, 255, 1],
        ['gamma', 'Gamma', 0.1, 10, 0.1],
        ['outputLow', 'Output black', 0, 254, 1],
        ['outputHigh', 'Output white', 1, 255, 1],
    ] as const;
</script>

<div class="channels" role="tablist" aria-label="Color channel">
    {#each CHANNELS as item}<button
            type="button"
            role="tab"
            aria-selected={channel === item}
            onclick={() => (channel = item)}>{item.toUpperCase()}</button
        >{/each}
</div>
{#if adjustment.type === 'curve'}
    <CurveEditor
        points={adjustment.channels[channel]}
        onchange={(points) => onchange({ ...adjustment, channels: { ...adjustment.channels, [channel]: points } })}
    />
{:else}
    {#each rows as row}
        <label class="parameter"
            ><span>{row[1]}</span><input
                class="exact-value"
                aria-label={`${channel.toUpperCase()} ${row[1]} exact value`}
                type="number"
                min={row[2]}
                max={row[3]}
                step={row[4]}
                value={adjustment.channels[channel][row[0]]}
                onchange={(e) =>
                    onchange(setLevelsChannelValue(adjustment, channel, row[0] as LevelsKey, +e.currentTarget.value))}
            /><input
                type="range"
                min={row[2]}
                max={row[3]}
                step={row[4]}
                value={adjustment.channels[channel][row[0]]}
                oninput={(e) =>
                    onchange(setLevelsChannelValue(adjustment, channel, row[0] as LevelsKey, +e.currentTarget.value))}
            /></label
        >
    {/each}
{/if}

<style>
    .channels {
        display: flex;
        justify-content: center;
        gap: 2px;
    }
    .channels button {
        padding: 3px 12px;
        color: #888;
    }
    .channels button[aria-selected='true'] {
        background: #ffffff18;
        color: #fff;
    }
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
        border-radius: 0;
        outline: none;
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
</style>
