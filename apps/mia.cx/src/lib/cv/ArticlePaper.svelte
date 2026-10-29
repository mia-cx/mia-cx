<!--
    The field under a printed Article, in the Print theme's ink. Chromium repeats a fixed element on
    every printed page, so the later-pages still runs under each one; page 1 covers it with its own
    still on white paper. Both are baked dimmed over the text column (pnpm cv-stills).
-->
<script lang="ts">
    import first from './stills/article-1.webp';
    import later from './stills/article-2.webp';
</script>

<!-- Print-only, so they wait their turn behind what the page shows. -->
<img class="later" src={later} alt="" fetchpriority="low" decoding="async" />
<div class="first"><img src={first} alt="" fetchpriority="low" decoding="async" /></div>

<style>
    img {
        display: block;
        width: 100%;
        height: 100%;
    }
    .later {
        position: fixed;
        inset: 0;
        z-index: -2;
        /* As on the CV's later pages. */
        opacity: 0.6;
    }
    .first {
        position: absolute;
        top: 0;
        left: 0;
        z-index: -1;
        width: 210mm;
        height: 297mm;
        background: #fff;
    }
</style>
