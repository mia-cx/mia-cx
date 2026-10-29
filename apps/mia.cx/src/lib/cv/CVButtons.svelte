<!--
    The CV's downloads, joined like a split button: "Download CV" for the Colour theme, then an icon
    button for the print-friendly one, named by a popover that shows at once on hover or focus.
-->
<script lang="ts">
    import FileText from '~icons/lucide/file-text';
    import Printer from '~icons/lucide/printer';

    let { role }: { /** Carried into the PDF, so it matches the CV being shown. */ role?: string | null } = $props();

    const href = (theme: 'colour' | 'print') => `/cv.pdf?${new URLSearchParams({ theme, ...(role ? { role } : {}) })}`;
</script>

<div class="cv-buttons">
    <a href={href('colour')} download><span class="label">Download CV</span> <FileText aria-hidden="true" /></a>
    <a href={href('print')} download aria-label="Download print-friendly CV" class="icon">
        <span class="doc" aria-hidden="true"><FileText /><span class="badge"><Printer /></span></span>
        <span class="tip" aria-hidden="true">Print-friendly</span>
    </a>
</div>

<style>
    .cv-buttons {
        /* Icon boxes, in cap heights of the label. */
        --icon: 1.5;
        display: flex;
    }
    a {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        height: 40px;
        padding: 0 12px;
        border: 1px solid var(--panel-line);
        background: var(--control);
        color: var(--ink);
        font-size: 15px;
        text-decoration: none;
        transition:
            border-color 140ms ease,
            color 140ms ease;
    }
    /* The second half shares the first's border. */
    a + a {
        margin-left: -1px;
    }
    a:hover,
    a:focus-visible {
        position: relative;
        z-index: 1;
        border-color: var(--accent);
        color: var(--accent);
    }
    .cv-buttons :global(svg) {
        width: calc(var(--icon) * 1cap);
        height: calc(var(--icon) * 1cap);
    }
    /* A fixed on-screen stroke, so the smaller printer badge draws as heavy as the document. */
    .cv-buttons :global(svg *) {
        vector-effect: non-scaling-stroke;
        stroke-width: 0.065em;
    }
    .icon {
        position: relative;
        justify-content: center;
        width: 40px;
        padding: 0;
    }
    /* The document lines up with its neighbour; only the badge's sideways overhang is balanced, by half. */
    .doc {
        position: relative;
        display: grid;
        translate: calc(var(--icon) * -0.17cap) 0;
    }
    /* Trimmed to cap height and baseline, so centring lines the icons up with the capitals. */
    .label {
        text-box: trim-both cap alphabetic;
    }
    /* The printer sits on the document's corner, cut out of it: the button behind is translucent. */
    .doc {
        --badge-right: calc(var(--icon) * -0.35cap);
        --badge-bottom: calc(var(--icon) * -0.3cap);
        --badge-size: calc(var(--icon) * 0.65cap + 2px);
    }
    .doc > :global(svg) {
        mask:
            linear-gradient(#000 0 0),
            linear-gradient(#000 0 0) right var(--badge-right) bottom var(--badge-bottom) / var(--badge-size)
                var(--badge-size) no-repeat;
        mask-composite: exclude;
    }
    .badge {
        position: absolute;
        right: var(--badge-right);
        bottom: var(--badge-bottom);
        display: grid;
        padding: 1px;
        line-height: 0;
    }
    .badge :global(svg) {
        width: calc(var(--icon) * 0.65cap);
        height: calc(var(--icon) * 0.65cap);
    }
    /* Instant, unlike a title tooltip. */
    .tip {
        position: absolute;
        top: calc(100% + 6px);
        /* Hung from the button's right edge, so it never pushes past the page's. */
        right: -1px;
        padding: 4px 8px;
        border: 1px solid var(--panel-line);
        background: var(--panel);
        color: var(--ink);
        font-size: 13px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
    }
    .icon:hover .tip,
    .icon:focus-visible .tip {
        opacity: 1;
    }
</style>
