<script lang="ts">
    import CV from '$lib/cv/CV.svelte';
    import CVButtons from '$lib/cv/CVButtons.svelte';
    import { site } from '$lib/content/site';

    let { data } = $props();

    /** An A4 sheet in CSS pixels. Narrower screens scale the sheets down to fit. */
    const SHEET_WIDTH = 794;
    let width = $state(SHEET_WIDTH);
    const zoom = $derived(Math.min(1, width / SHEET_WIDTH));
</script>

<svelte:head>
    <title>CV — {site.domain}</title>
    <meta property="og:title" content="{site.name}, {data.cv.title}" />
    <meta name="description" content="The CV of {site.name}, {data.cv.title}." />
    <meta name="cv-preset" content={data.preset} />
</svelte:head>

<main class="container">
    <div class="actions"><CVButtons role={data.role} /></div>
    <div class="sheets" bind:clientWidth={width}>
        <div style:zoom>
            <CV cv={data.cv} theme={data.theme} />
        </div>
    </div>
</main>

<style>
    main {
        padding-top: calc(var(--header-height) + clamp(28px, 7vh, 72px));
    }
    .actions {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 24px;
    }
    /* Until the script scales the sheets to fit (or if it never runs), they scroll here, not the page. */
    .sheets {
        overflow-x: auto;
    }
    .sheets > div {
        display: grid;
        justify-content: center;
        gap: 24px;
    }
</style>
