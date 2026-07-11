<script lang="ts">
    import CurveEditor from './CurveEditor.svelte';
    import {
        applyCurveEditToChannels,
        CHANNELS,
        HSL_CHANNELS,
        setCurveMode,
        setLevelsChannelsValue,
        toggleChannelMask,
        type Adjustment,
        type CurveChannel,
        type Channel,
        type LevelsKey,
    } from './adjustments';
    let { adjustment, onchange }: { adjustment: Adjustment; onchange: (value: Adjustment) => void } = $props();
    let descriptors = $derived(adjustment.type === 'curve' && adjustment.mode === 'hsl' ? HSL_CHANNELS : CHANNELS);
    let channelMask: CurveChannel[] = $state([]);
    let priorCurveKey = $state('');
    $effect(() => {
        const curveKey = `${adjustment.id}:${adjustment.type === 'curve' ? adjustment.mode : 'levels'}`;
        if (priorCurveKey !== curveKey) {
            priorCurveKey = curveKey;
            channelMask = [...descriptors];
        }
    });
    let channel = $derived(descriptors.find((item) => channelMask.includes(item)) ?? descriptors[0]);
    let rgbChannel = $derived(channel as Channel);
    let rgbMask = $derived(channelMask as Channel[]);
    const rows = [
        ['inputLow', 'Input black', 0, 254, 1],
        ['inputHigh', 'Input white', 1, 255, 1],
        ['gamma', 'Gamma', 0.1, 10, 0.1],
        ['outputLow', 'Output black', 0, 254, 1],
        ['outputHigh', 'Output white', 1, 255, 1],
    ] as const;
</script>

<div class="channels" aria-label="Color channels">
    {#if adjustment.type === 'curve'}
        <label class="mode"
            >Mode <select
                value={adjustment.mode}
                onchange={(event) => onchange(setCurveMode(adjustment, event.currentTarget.value as 'rgb' | 'hsl'))}
            >
                <option value="rgb">RGB</option>
                <option value="hsl">HSL</option>
            </select></label
        >
    {/if}
    {#each descriptors as item}<label class={`channel-${item}`}
            ><input
                type="checkbox"
                checked={channelMask.includes(item)}
                onchange={() => (channelMask = toggleChannelMask(channelMask, item, descriptors))}
            />{item.toUpperCase()}</label
        >{/each}
</div>
{#if adjustment.type === 'curve'}
    <CurveEditor
        points={adjustment.channels[channel as keyof typeof adjustment.channels]}
        channels={adjustment.channels as Record<string, import('./adjustments').CurvePoint[]>}
        {descriptors}
        {channelMask}
        onedit={(edit) => onchange(applyCurveEditToChannels(adjustment, channelMask, edit))}
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
                value={adjustment.channels[rgbChannel][row[0]]}
                disabled={channelMask.length === 0}
                onchange={(e) =>
                    onchange(setLevelsChannelsValue(adjustment, rgbMask, row[0] as LevelsKey, +e.currentTarget.value))}
            /><input
                type="range"
                min={row[2]}
                max={row[3]}
                step={row[4]}
                value={adjustment.channels[rgbChannel][row[0]]}
                disabled={channelMask.length === 0}
                oninput={(e) =>
                    onchange(setLevelsChannelsValue(adjustment, rgbMask, row[0] as LevelsKey, +e.currentTarget.value))}
            /></label
        >
    {/each}
{/if}

<style>
    .channels {
        display: flex;
        justify-content: center;
        gap: 12px;
    }
    .channels label {
        display: flex;
        align-items: center;
        gap: 3px;
        color: #aaa;
        text-transform: none;
    }
    .channels .channel-r {
        color: #ff7777;
    }
    .channels .channel-g {
        color: #77ff91;
    }
    .channels .channel-b {
        color: #8298ff;
    }
    .channels .channel-h {
        color: #ff77df;
    }
    .channels .channel-s {
        color: #77eaff;
    }
    .channels .channel-l {
        color: #fff28a;
    }
    .channels .mode {
        color: #aaa;
    }
    .mode select {
        border: 0;
        border-bottom: 1px solid #ffffff24;
        background: transparent;
        color: #ddd;
        font: inherit;
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
