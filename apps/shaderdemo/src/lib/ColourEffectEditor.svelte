<script lang="ts">
    import { SELECTIVE_RANGES, parseCube, saveCubeAsset, type RgbColourEffect } from './colour-effects';
    let { effect, onchange }: { effect: RgbColourEffect; onchange: (x: RgbColourEffect) => void } = $props();
    const names = (e: RgbColourEffect) =>
        e.type === 'lift-gamma-gain'
            ? ['Lift R', 'Lift G', 'Lift B', 'Gamma R', 'Gamma G', 'Gamma B', 'Gain R', 'Gain G', 'Gain B']
            : e.type === 'three-way'
              ? [
                    'Shadows R',
                    'Shadows G',
                    'Shadows B',
                    'Midtones R',
                    'Midtones G',
                    'Midtones B',
                    'Highlights R',
                    'Highlights G',
                    'Highlights B',
                    'Exposure',
                    'Spare 1',
                    'Spare 2',
                ]
              : e.type === 'channel-mixer'
                ? ['R←R', 'R←G', 'R←B', 'G←R', 'G←G', 'G←B', 'B←R', 'B←G', 'B←B', 'Offset R', 'Offset G', 'Offset B']
                : e.type === 'color-balance'
                  ? [
                        'Shadows R',
                        'Shadows G',
                        'Shadows B',
                        'Midtones R',
                        'Midtones G',
                        'Midtones B',
                        'Highlights R',
                        'Highlights G',
                        'Highlights B',
                    ]
                  : e.type === 'posterize'
                    ? ['Levels']
                    : e.type === 'solarize'
                      ? ['Amount', 'Threshold']
                      : e.type === 'dither'
                        ? ['Levels', 'Strength']
                        : e.type === 'tone-mapping'
                          ? ['Exposure', 'Gamma', 'White point']
                          : [];
    function set(i: number, v: number) {
        const values = [...effect.values];
        values[i] = v;
        onchange({ ...effect, values });
    }
    async function cube(file: File) {
        try {
            const parsed = parseCube(await file.text());
            const assetId = await saveCubeAsset(parsed, file.name);
            onchange({ ...effect, assetId, assetName: file.name, assetSize: parsed.size, missing: false });
        } catch (e) {
            alert(e instanceof Error ? e.message : String(e));
        }
    }
</script>

{#if effect.type === 'dither'}<label
        >Mode <select value={effect.mode} onchange={(e) => onchange({ ...effect, mode: e.currentTarget.value })}
            ><option value="bayer">Ordered Bayer</option><option value="blue-noise">Procedural blue noise</option
            ><option value="approx-error-diffusion">Approx. error-diffusion-ish (not true diffusion)</option></select
        ></label
    >{/if}
{#if effect.type === 'tone-mapping'}<label
        >Operator <select value={effect.mode} onchange={(e) => onchange({ ...effect, mode: e.currentTarget.value })}
            ><option value="none">None</option><option value="reinhard">Reinhard</option><option value="aces"
                >ACES fitted</option
            ><option value="agx">AgX approximation</option><option value="custom">Custom</option></select
        ></label
    >{/if}
{#if effect.type === 'lut'}<label
        >Import .cube <input
            type="file"
            accept=".cube"
            onchange={(e) => e.currentTarget.files?.[0] && cube(e.currentTarget.files[0])}
        /></label
    >
    <p class:missing={!effect.assetId || effect.missing}>
        {effect.assetId && effect.missing
            ? `Asset unavailable: ${effect.assetName ?? effect.assetId}. Select the .cube file again to restore it.`
            : effect.assetId
              ? `${effect.assetName} (${effect.assetSize}³) — browser asset ${effect.assetId}`
              : 'No LUT asset loaded. JSON exports contain references only.'}
    </p>
{:else if effect.type === 'selective-color'}{#each SELECTIVE_RANGES as range, r}<details>
            <summary>{range}</summary>{#each ['Cyan', 'Magenta', 'Yellow', 'Black'] as n, i}<label
                    >{n}<input
                        type="number"
                        min="-1"
                        max="1"
                        step="0.01"
                        value={effect.values[r * 4 + i]}
                        onchange={(e) => set(r * 4 + i, +e.currentTarget.value)}
                    /></label
                >{/each}
        </details>{/each}
{:else}{#each names(effect) as n, i}<label
            >{n}<input
                type="number"
                step={effect.type === 'posterize' ? '1' : '0.01'}
                value={effect.values[i]}
                onchange={(e) => set(i, +e.currentTarget.value)}
            /><input
                type="range"
                min={effect.type === 'posterize' ? '2' : '-2'}
                max={effect.type === 'posterize' ? '256' : '2'}
                step={effect.type === 'posterize' ? '1' : '0.01'}
                value={effect.values[i]}
                oninput={(e) => set(i, +e.currentTarget.value)}
            /></label
        >{/each}{/if}

<style>
    label {
        display: grid;
        grid-template-columns: 1fr 70px;
        gap: 5px;
    }
    label input[type='range'] {
        grid-column: 1/-1;
        width: 100%;
    }
    select {
        background: #090909;
        color: #ddd;
    }
    .missing {
        color: #f99;
    }
    p {
        font-size: 10px;
        word-break: break-all;
    }
    details {
        border-top: 1px solid #ffffff18;
        padding: 2px;
    }
</style>
