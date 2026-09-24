<script lang="ts">
    import { marked } from 'marked';
    import '$lib/styles/prose.css';
    import Contact from '$lib/components/Contact.svelte';
    import { about, biography, site } from '$lib/content/site';
</script>

<svelte:head>
    <title>About — {site.domain}</title>
    <meta name="description" content={about[0]} />
</svelte:head>

<main class="container">
    <h1>About me</h1>
    <div class="prose">
        {#each biography as paragraph (paragraph)}
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- the biography is authored in this repo -->
            <p>{@html marked.parseInline(paragraph, { async: false })}</p>
        {/each}
    </div>
    <Contact />
</main>

<style>
    main {
        padding-top: calc(var(--header-height) + clamp(28px, 7vh, 72px));
    }
    h1 {
        margin-bottom: 28px;
        font-size: clamp(38px, 7vw, 92px);
        font-weight: 660;
        font-stretch: 70%;
        line-height: 0.9;
        letter-spacing: -0.035em;
    }
    .prose {
        margin-bottom: 40px;
    }
</style>
