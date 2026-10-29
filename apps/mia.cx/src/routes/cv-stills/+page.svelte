<!--
    The bake page for the printed field. Not linked from anywhere: scripts/cv-stills.ts opens it in
    a real Chromium, which has WebGPU, and saves each sheet's field as an image with alpha. The CV's
    sheets dim the field around their own text; an Article's sheets dim it over the whole text column.
-->
<script lang="ts">
    import { onMount } from 'svelte';
    import CV from '$lib/cv/CV.svelte';
    import BakeField from './BakeField.svelte';

    /** Page 1 has its own still; every later page shares the second. */
    const STILLS = [
        { seed: 93.8, time: 56.25 },
        { seed: 91.3, time: 32.65 },
    ];
    /** Tuned on the CV prototype: the field dims hard and close around the copy. */
    const CALM = { strength: 0.95, radius: 73, feather: 137 };

    // No shader on this page means nothing ever ends the first-load state; there is no entrance here.
    onMount(() => delete document.documentElement.dataset.boot);
</script>

<svelte:head>
    <title>Print stills</title>
    <meta name="robots" content="noindex" />
</svelte:head>

<div class="stills">
    <CV>
        {#snippet field(page)}
            <BakeField name="cv-{page}" {...STILLS[page - 1]} calm={CALM} />
        {/snippet}
    </CV>

    {#each STILLS as still, i (i)}
        <div class="sheet" data-print-sheet>
            <BakeField name="article-{i + 1}" {...still} calm={CALM} />
            <!-- Stands for an Article's text: the whole column inside the page margins. -->
            <svg class="column" aria-hidden="true"></svg>
        </div>
    {/each}
</div>

<style>
    :global(html:has(.stills)) {
        background: transparent;
    }

    .stills {
        display: grid;
        justify-content: center;
        gap: 10mm;
        padding: 10mm;
    }

    /* Only the field shows; the content stays laid out, so the calm mask still measures it. */
    .stills :global(.sheet[data-print-sheet]) {
        background: transparent;
    }
    .stills :global([data-print-sheet] > :not(canvas)) {
        opacity: 0;
    }

    /* The @page margins every printed Article page keeps. */
    .column {
        position: absolute;
        top: 18mm;
        left: 20mm;
        width: calc(100% - 40mm);
        height: calc(100% - 36mm);
    }
</style>
