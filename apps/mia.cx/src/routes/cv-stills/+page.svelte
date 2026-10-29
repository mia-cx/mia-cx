<!--
    The bake page for the printed field and portrait. Not linked from anywhere: scripts/cv-stills.ts
    opens it in a real Chromium, which has WebGPU, and saves each layer as an image with alpha, masks
    and all, since PDF readers drop CSS masks. The CV's sheets dim the field around their own text and
    photo; an Article's sheets dim it over the whole text column.
-->
<script lang="ts">
    import { onMount } from 'svelte';
    import CV from '$lib/cv/CV.svelte';
    import BakeField from './BakeField.svelte';
    import BakePortrait from './BakePortrait.svelte';

    /** Page 1 has its own still; every later page shares the second. */
    const STILLS = [
        { seed: 93.8, time: 56.25 },
        { seed: 91.3, time: 32.65 },
    ];
    /** Tuned on the CV prototype: the field dims hard and close around the copy. */
    const CALM = { strength: 0.95, radius: 73, feather: 137 };
    /**
     * How the field fades down a sheet. Colour fades page 1 only, full at the top easing to half, like
     * the home page as the hero scrolls away; later pages sit at an even half. Print fades every page
     * further, so the ink stays near the top.
     */
    const FADE = {
        colour: 'linear-gradient(to bottom, #000 22%, rgb(0 0 0 / 0.5) 55%)',
        print: 'linear-gradient(to bottom, #000 30%, rgb(0 0 0 / 0.25) 60%)',
    };

    // No shader on this page means nothing ever ends the first-load state; there is no entrance here.
    onMount(() => delete document.documentElement.dataset.boot);
</script>

<svelte:head>
    <title>Print stills</title>
    <meta name="robots" content="noindex" />
</svelte:head>

<div class="stills">
    <!-- Each Theme's pages, for their fades. -->
    <CV>
        {#snippet field(page)}
            <BakeField
                name="cv-{page}-colour"
                {...STILLS[page - 1]}
                calm={CALM}
                fade={page === 1 ? FADE.colour : undefined}
            />
        {/snippet}
    </CV>
    <CV>
        {#snippet field(page)}
            <BakeField name="cv-{page}-print" {...STILLS[page - 1]} calm={CALM} fade={FADE.print} />
        {/snippet}
    </CV>

    <!-- Articles print in the Print theme. -->
    {#each STILLS as still, i (i)}
        <div class="sheet" data-print-sheet>
            <BakeField name="article-{i + 1}" {...still} calm={CALM} fade={FADE.print} />
            <!-- Stands for an Article's text: the whole column inside the page margins. -->
            <svg class="column" aria-hidden="true"></svg>
        </div>
    {/each}

    <BakePortrait />
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
