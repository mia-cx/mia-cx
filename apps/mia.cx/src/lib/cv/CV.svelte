<!--
    Mia's CV as two A4 sheets: page 1 for scanning, page 2 for the detail. The markup is in reading
    order under standard headings, so ATS parsers file it correctly from the PDF's text.
-->
<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cv } from './content';
    import bakedPortrait from './stills/portrait.webp';
    import faceColour from './stills/face-colour.webp';
    import facePrint from './stills/face-print.webp';
    import Sheet, { type Theme } from './Sheet.svelte';
    import Timeline from './Timeline.svelte';

    let {
        /** Colour puts the field on dark paper; Print multiplies it into white paper. */
        theme = 'print',
        /** Replaces each sheet's baked field; the stills bake draws a live one here. */
        field,
        /**
         * The photo, faded by the bake. The bake itself passes the unfaded cutout, so the field is
         * dimmed around the whole figure, as the prototype measured it.
         */
        portrait = bakedPortrait,
    }: { theme?: Theme; field?: Snippet<[page: number]>; portrait?: string } = $props();

    /** The face, kept clear of the field: Colour's copy carries the field's haze, Print's is bare. */
    const face = { colour: faceColour, print: facePrint };
</script>

<Sheet page={1} {theme} {field}>
    <!-- Both layers come faded from the bake (pnpm cv-stills); the face copy sits above the field. -->
    <!-- Print-only on most pages, so they wait their turn behind what the page shows. -->
    <img class="portrait" src={portrait} alt="Portrait of {cv.name}" fetchpriority="low" decoding="async" />
    <img
        class="portrait face"
        src={face[theme]}
        alt=""
        data-atmosphere-calm="off"
        fetchpriority="low"
        decoding="async"
    />

    <header>
        <h1>{cv.name}</h1>
        <p class="title">{cv.title}</p>
        <ul class="contact">
            {#each cv.contact as { label, href } (href)}
                <li><a {href}>{label}</a></li>
            {/each}
            <li>{cv.location}</li>
        </ul>
    </header>

    <section class="profile">
        <h2>Profile</h2>
        <p>{cv.profile}</p>
    </section>

    <div class="columns">
        <section>
            <h2>Timeline</h2>
            <Timeline work={cv.timeline.work} creative={cv.timeline.creative} />
        </section>

        <div>
            <section>
                <h2>Skills</h2>
                <dl class="skills">
                    {#each cv.skills as { area, items } (area)}
                        <div>
                            <dt>{area}</dt>
                            <dd>{items}</dd>
                        </div>
                    {/each}
                </dl>
            </section>

            <section>
                <h2>Languages</h2>
                <dl class="languages">
                    {#each cv.languages as { language, level } (language)}
                        <dt>{language}</dt>
                        <dd>{level}</dd>
                    {/each}
                </dl>
            </section>
        </div>
    </div>
</Sheet>

<Sheet page={2} {theme} {field} layout="rows">
    <section>
        <h2>About</h2>
        <div>
            {#each cv.about as paragraph (paragraph)}
                <p>{paragraph}</p>
            {/each}
        </div>
    </section>

    <section>
        <h2>Experience</h2>
        <div>
            {#each cv.experience as role (role.title + role.company)}
                <div class="entry">
                    <h3>{role.title} <span>· {role.company} · {role.dates}</span></h3>
                    <p>{role.description}</p>
                </div>
            {/each}
        </div>
    </section>

    <section>
        <h2>Selected work</h2>
        <ul class="work">
            {#each cv.work as { name, description, link } (name)}
                <li>
                    <b>{name}</b>: {description}
                    {#if link}<a class="url" href={link.href}>{link.label}</a>{/if}
                </li>
            {/each}
        </ul>
    </section>

    <section>
        <h2>Education</h2>
        <div>
            {#each cv.education as { title, school, dates, note } (title)}
                <div class="entry">
                    <h3>{title} <span>· {school} · {dates}{note ? ` · ${note}` : ''}</span></h3>
                </div>
            {/each}
        </div>
    </section>
</Sheet>

<style>
    .portrait {
        position: absolute;
        top: 20.5mm;
        right: 5mm;
        width: 78mm;
    }
    .face {
        z-index: 3;
    }

    header {
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        height: 70mm;
        padding-bottom: 5mm;
    }
    h1 {
        /* One word to a line. */
        width: min-content;
        font-size: 44pt;
        font-weight: 660;
        font-stretch: 70%;
        line-height: 0.88;
        letter-spacing: -0.03em;
    }
    .title {
        margin: 3mm 0 4mm;
        font-size: 14pt;
        font-weight: 500;
        font-stretch: 76%;
        color: var(--dim);
    }
    .contact {
        display: flex;
        flex-wrap: wrap;
        gap: 1mm 5mm;
        font-size: 8.4pt;
    }

    .profile p {
        max-width: 128mm;
        font-size: 9.6pt;
    }

    /* Page 1's two columns: the timeline left, Skills and Languages right. */
    .columns {
        display: grid;
        grid-template-columns: 110mm 1fr;
        gap: 0 6mm;
    }
    /* Skills and Languages run the timeline's height, so the column ends where it does: the skill areas spread out. */
    .columns > div {
        display: flex;
        flex-direction: column;
    }
    .columns > div > section:first-child {
        display: flex;
        flex: 1;
        flex-direction: column;
    }
    .skills {
        display: flex;
        flex: 1;
        flex-direction: column;
        justify-content: space-between;
        gap: 4mm;
    }
    dl {
        margin: 0;
    }
    dt {
        color: var(--dim);
    }
    dd {
        margin: 0;
    }
    .languages {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 1mm 4mm;
    }

    .entry {
        margin-bottom: 2.6mm;
    }
    .entry p {
        margin: 0;
    }
    h3 {
        margin: 0 0 0.6mm;
        font-size: 9.4pt;
        font-weight: 650;
    }
    h3 span {
        font-weight: 400;
        color: var(--dim);
    }

    .work li {
        margin-bottom: 1mm;
    }
    .work b {
        font-weight: 650;
    }
    .work .url {
        color: var(--dim);
    }
</style>
