<!--
    Mia's CV as two A4 sheets: page 1 for scanning, page 2 for the detail. The markup is in reading
    order under standard headings, so ATS parsers file it correctly from the PDF's text.
-->
<script lang="ts">
    import { cv } from './content';
    import Timeline from './Timeline.svelte';
</script>

<article class="sheet" data-print-sheet>
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

    <section>
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
                <dl class="stacked">
                    {#each cv.skills as { area, items } (area)}
                        <dt>{area}</dt>
                        <dd>{items}</dd>
                    {/each}
                </dl>
            </section>

            <section>
                <h2>Languages</h2>
                <dl>
                    {#each cv.languages as { language, level } (language)}
                        <dt>{language}</dt>
                        <dd>{level}</dd>
                    {/each}
                </dl>
            </section>
        </div>
    </div>
</article>

<article class="sheet" data-print-sheet>
    <section>
        <h2>About</h2>
        {#each cv.about as paragraph (paragraph)}
            <p>{paragraph}</p>
        {/each}
    </section>

    <section>
        <h2>Experience</h2>
        {#each cv.experience as role (role.title + role.company)}
            <div class="entry">
                <h3>{role.title} <span>· {role.company} · {role.dates}</span></h3>
                <p>{role.description}</p>
            </div>
        {/each}
    </section>

    <section>
        <h2>Selected work</h2>
        <ul>
            {#each cv.work as { name, description, link } (name)}
                <li>
                    <b>{name}</b>: {description}
                    {#if link}<a href={link.href}>{link.label}</a>{/if}
                </li>
            {/each}
        </ul>
    </section>

    <section>
        <h2>Education</h2>
        {#each cv.education as { title, school, dates, note } (title)}
            <h3>{title} <span>· {school} · {dates}{note ? ` · ${note}` : ''}</span></h3>
        {/each}
    </section>
</article>

<style>
    .sheet {
        display: flex;
        flex-direction: column;
        gap: 7mm;
        padding: 18mm 20mm;
        background: #fff;
        color: #000;
        font-size: 9.5pt;
        line-height: 1.45;
    }

    h1 {
        font-size: 28pt;
        line-height: 1;
    }

    h2 {
        margin-bottom: 2mm;
        font-size: 11pt;
    }

    h3 {
        font-size: 9.5pt;
    }

    h3 span {
        font-weight: 400;
    }

    /* Page 1's two columns: the timeline left, Skills and Languages right. */
    .columns {
        display: grid;
        grid-template-columns: 110mm 1fr;
        gap: 6mm;
    }

    .columns > div {
        display: flex;
        flex-direction: column;
        gap: 7mm;
    }

    /* The column is too narrow to set a skill area beside its list. */
    dl.stacked {
        display: block;
    }

    dl.stacked dd + dt {
        margin-top: 1.5mm;
    }

    .contact {
        display: flex;
        flex-wrap: wrap;
        gap: 0 5mm;
        margin-top: 3mm;
    }

    dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 1mm 6mm;
    }

    dd {
        margin: 0;
    }

    p + p,
    .entry + .entry {
        margin-top: 2.5mm;
    }

    a {
        color: inherit;
        text-decoration: none;
    }
</style>
