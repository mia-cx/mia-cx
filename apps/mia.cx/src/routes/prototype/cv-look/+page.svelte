<!--
    PROTOTYPE, throwaway. Answers "CV look on paper" (https://github.com/mia-cx/mia-cx/issues/80):
    which seed and frame each page uses, and how the portrait is cropped. Run `pnpm dev` in apps/mia.cx
    and open /prototype/cv-look.
-->
<script lang="ts">
    import { onMount } from 'svelte';
    import { BAKED_RENDER_OPTIONS, loadBakedRenderOptions } from '@mia-cx/atmosphere/baked-settings';
    import { selectRenderBackend, type RenderBackend } from '@mia-cx/atmosphere/render-backend';
    import portrait from '$lib/assets/portrait-800.webp';
    import { encode } from 'uqr';
    import FileText from '~icons/lucide/file-text';
    import Printer from '~icons/lucide/printer';
    import { listedWork } from '$lib/content/vault';
    import { site } from '$lib/content/site';

    type Theme = 'colour' | 'print';
    let theme = $state<Theme>('colour');
    /** How the field meets white paper: its flares over the page, or as ink multiplied into it. */
    let light = $state<'flares' | 'ink'>('ink');
    const ink = $state({ falloff: 1, saturate: 1 });

    /** Page 1 has its own still; page 2 stands for every page after it. */
    const field = $state([
        { seed: 93.8, time: 56.25 },
        { seed: 91.3, time: 32.65 },
    ]);
    const canvases: HTMLCanvasElement[] = [];
    let renderers = $state<(RenderBackend | undefined)[]>([]);
    let base = BAKED_RENDER_OPTIONS;

    const p = $state({
        ...{ right: 5, top: 20.5, width: 78, rx: 58, ry: 34, cx: 50, cy: 16, start: 0.45, curve: 2.8 },
        // The face, kept clear of the field as on the home hero: a feathered ellipse, in shares of the photo.
        ...{ faceX: 50, faceY: 12, faceRx: 34, faceRy: 20, faceSolid: 55 },
    });

    /** An elliptical mask whose fade starts flat and eases out, (1 − u²)^curve, so it has no hard edge. */
    const mask = $derived.by(() => {
        const steps = 16;
        const stops = Array.from({ length: steps + 1 }, (_, i) => {
            const u = i / steps;
            const at = (p.start + (1 - p.start) * u) * 100;
            return `rgb(0 0 0 / ${((1 - u * u) ** p.curve).toFixed(3)}) ${at.toFixed(1)}%`;
        });
        return `radial-gradient(ellipse ${p.rx}% ${p.ry}% at ${p.cx}% ${p.cy}%, ${stops.join(', ')})`;
    });
    const face = $derived(
        `radial-gradient(ellipse ${p.faceRx}% ${p.faceRy}% at ${p.faceX}% ${p.faceY}%, #000 ${p.faceSolid}%, transparent 100%)`,
    );

    const portraitControls: [keyof typeof p, string, number, number, number][] = [
        ['right', 'From right (mm)', -20, 40, 0.5],
        ['top', 'From top (mm)', -20, 40, 0.5],
        ['width', 'Width (mm)', 40, 120, 0.5],
        ['rx', 'Ellipse width (%)', 15, 80, 0.5],
        ['ry', 'Ellipse height (%)', 10, 60, 0.5],
        ['cx', 'Centre x (%)', 20, 80, 0.5],
        ['cy', 'Centre y (%)', 5, 60, 0.5],
        ['start', 'Fade starts', 0, 0.9, 0.01],
        ['curve', 'Fade curve', 0.5, 6, 0.1],
    ];
    const faceControls: typeof portraitControls = [
        ['faceX', 'Centre x (%)', 20, 80, 0.5],
        ['faceY', 'Centre y (%)', 0, 50, 0.5],
        ['faceRx', 'Width (%)', 10, 60, 0.5],
        ['faceRy', 'Height (%)', 5, 50, 0.5],
        ['faceSolid', 'Feather starts (%)', 0, 95, 1],
    ];

    /** Sheets after page 2 (the Appendix) share its still. */
    const still = (i: number) => field[Math.min(i, field.length - 1)];

    /** The Appendix /work would print: each listed item with its tagline, printed URL and a QR code. */
    const appendix = listedWork.map((item) => {
        const url = item.markdown ? `${site.url}/work/${item.slug}` : (item.live ?? item.source ?? site.url);
        const { data, size } = encode(url, { border: 0 });
        const path = data.flatMap((row, y) => row.flatMap((on, x) => (on ? [`M${x} ${y}h1v1h-1z`] : []))).join('');
        return { title: item.title, tagline: item.summary, url: url.replace(/^https?:\/\//, ''), qr: { size, path } };
    });
    // PROTOTYPE: a fixed count per sheet stands in for real page breaks.
    const PER_SHEET = 12;
    const appendixSheets = Array.from({ length: Math.ceil(appendix.length / PER_SHEET) }, (_, i) =>
        appendix.slice(i * PER_SHEET, (i + 1) * PER_SHEET),
    );

    let zoom = $state(1);
    const fit = () => (zoom = Math.min(1, (innerWidth - 340) / (2 * 794 + 40)));

    onMount(() => {
        fit();
        let disposed = false;
        loadBakedRenderOptions().then((loaded) => {
            base = { ...loaded, renderScale: 1, dprCap: 2 };
            canvases.forEach((canvas, i) =>
                selectRenderBackend(canvas, { ...base, seed: still(i).seed }).then(({ renderer }) => {
                    if (disposed) return renderer.destroy();
                    renderer.setPaused(true);
                    renderers[i] = renderer;
                }),
            );
        });
        return () => {
            disposed = true;
            renderers.forEach((r) => r?.destroy());
        };
    });

    $effect(() => {
        renderers.forEach((renderer, i) => {
            if (!renderer) return;
            const { seed, time } = still(i);
            renderer.setOptions({ ...base, seed });
            // PROTOTYPE: the renderers keep simulation time private; scrubbing it is the whole point here.
            (renderer as unknown as { simTime: number }).simTime = time;
            renderer.invalidate();
        });
    });

    const values = $derived(JSON.stringify({ pages: field, portrait: p, light, ink }));

    // The timeline: ln(1 + k·(now − t)), k = 2, ending at the present with a dashed tail.
    const START = 2012, K = 2, H = 92, T = 7, W = 182, X0 = W / 2;
    const d = new Date();
    const NOW = d.getFullYear() + (d.getMonth() + d.getDate() / 31) / 12;
    const ym = (y: number, m: number) => y + (m - 1) / 12;
    const f = (x: number) => Math.log1p(K * x);
    const y = (t: number) => 6 + H * (1 - f(NOW - t) / f(NOW - START));
    type Row = [string, string, number, number | null];
    const sides: Record<'left' | 'right', Row[]> = {
        left: [
            ['VWO', 'Dorenweerd College · Sep 2012 – Jul 2019', ym(2012, 9), ym(2019, 7)],
            ['Grocery Clerk', 'Albert Heijn · Sep 2016 – Mar 2020', ym(2016, 9), ym(2020, 3)],
            ['Music &amp; Technology', 'HKU · Sep 2020 – Jul 2023', ym(2020, 9), ym(2023, 7)],
            ['Call Agent', 'GGD Coronalijn · Feb – Jul 2022', ym(2022, 2), ym(2022, 7)],
            ['Customer Care Agent', 'ABN AMRO · Nov 2023 – Jul 2025', ym(2023, 11), ym(2025, 7)],
            ['Junior Support Consultant', 'Humaris · Sep 2026 – present', ym(2026, 9), null],
        ],
        right: [
            ['Music', 'Apr 2012', ym(2012, 4), null],
            ['Sound engineering', 'Nov 2016', ym(2016, 11), null],
            ['Design &amp; development', 'May 2018', ym(2018, 5), null],
            ['Founder, mia.cx', 'Jul 2021', ym(2021, 7), null],
        ],
    };
    function timeline() {
        let out = `<text class="tl-head" x="${X0 - 9}" y="2" text-anchor="end">Work &amp; education</text><text class="tl-head" x="${X0 + 9}" y="2">Creative</text>`;
        out += `<line class="tl-axis" x1="${X0}" x2="${X0}" y1="${y(START)}" y2="${y(NOW)}" stroke-width="0.3"/><line class="tl-tail" x1="${X0}" x2="${X0}" y1="${y(NOW)}" y2="${y(NOW) + T}" stroke-width="0.3"/>`;
        let last = -Infinity;
        for (let yr = START; yr <= Math.floor(NOW); yr++) {
            const yy = y(yr);
            out += `<line class="tl-axis" x1="${X0 - 0.9}" x2="${X0 + 0.9}" y1="${yy}" y2="${yy}" stroke-width="0.2"/>`;
            if (yr === START || (yy - last >= 3.5 && y(NOW) - yy >= 3)) {
                out += `<text class="tl-year" x="${X0 - 1.6}" y="${yy + 0.8}" text-anchor="end">${yr}</text>`;
                last = yy;
            }
        }
        for (const [side, list] of Object.entries(sides)) {
            const dir = side === 'left' ? -1 : 1;
            const ends: number[] = [], lanes: number[] = [];
            for (const e of list) {
                let i = ends.findIndex((x) => x <= e[2]);
                if (i < 0) i = ends.length;
                ends[i] = e[3] ?? NOW;
                lanes.push(i);
            }
            const lx = X0 + dir * (9 + (Math.max(...lanes) + 1) * 2 + 2), anchor = dir < 0 ? 'end' : 'start';
            let floor = -Infinity;
            list.forEach(([t, s, a, b], i) => {
                const x = X0 + dir * (9 + lanes[i] * 2), ya = y(a), yb = y(b ?? NOW);
                out += `<line class="tl-bar" x1="${x}" x2="${x}" y1="${ya}" y2="${yb}"/><circle class="tl-dot" cx="${x}" cy="${ya}" r="0.6"/>`;
                out += b ? `<circle class="tl-dot" cx="${x}" cy="${yb}" r="0.4"/>` : `<line class="tl-tail" x1="${x}" x2="${x}" y1="${yb}" y2="${yb + T}"/>`;
                const ly = Math.max(ya, floor);
                floor = ly + 6.6;
                out += `<text class="tl-t" x="${lx}" y="${ly + 2.4}" text-anchor="${anchor}">${t}</text><text class="tl-s" x="${lx}" y="${ly + 5}" text-anchor="${anchor}">${s}</text>`;
            });
        }
        return out;
    }
    const tlView = `0 -1 ${W} ${y(NOW) + T + 2}`;
</script>

<svelte:window onresize={fit} />
<svelte:head>
    <title>PROTOTYPE · CV look</title>
</svelte:head>

<svg width="0" height="0" style="position:absolute" aria-hidden="true">
    <filter id="flares" color-interpolation-filters="sRGB">
        <feComponentTransfer><feFuncA type="linear" slope="1.8" intercept="-0.6" /></feComponentTransfer>
    </filter>
    <!-- Ink: the faint haze falls away on a power curve, so paper stays white between the lobes. -->
    <filter id="ink" color-interpolation-filters="sRGB">
        <feComponentTransfer><feFuncA type="gamma" amplitude="1" exponent={ink.falloff} offset="0" /></feComponentTransfer>
        <feColorMatrix type="saturate" values={String(ink.saturate)} />
    </filter>
</svg>

<div class="proto" data-theme={theme} data-light={light}>
    <aside>
        <h1>PROTOTYPE · CV look</h1>
        <!-- The CV buttons for home and the footer: Colour with a label, Print as an icon with an instant tooltip. -->
        <div class="cv-buttons">
            <a href="/cv.pdf?theme=colour" download>Download CV <FileText aria-hidden="true" /></a>
            <a href="/cv.pdf?theme=print" download aria-label="Download print-friendly CV" class="icon">
                <span class="doc" aria-hidden="true"><FileText /><span class="badge"><Printer /></span></span>
                <span class="tip" aria-hidden="true">Print-friendly</span>
            </a>
        </div>
        <fieldset>
            <legend>Theme</legend>
            <label><input type="radio" bind:group={theme} value="colour" /> Colour</label>
            <label><input type="radio" bind:group={theme} value="print" /> Print-friendly</label>
        </fieldset>
        <fieldset>
            <legend>On white</legend>
            <label><input type="radio" bind:group={light} value="flares" /> Flares</label>
            <label><input type="radio" bind:group={light} value="ink" /> Ink</label>
            {#if light === 'ink'}
                <label>Falloff <output>{ink.falloff}</output></label>
                <input type="range" min="1" max="5" step="0.1" bind:value={ink.falloff} />
                <label>Saturation <output>{ink.saturate}</output></label>
                <input type="range" min="0.5" max="3" step="0.05" bind:value={ink.saturate} />
            {/if}
        </fieldset>
        {#each field as page, i (i)}
            <fieldset>
                <legend>{i === 0 ? 'Page 1' : 'Page 2 and later'}</legend>
                <label>Seed <input type="number" step="0.1" bind:value={page.seed} /></label>
                <input type="range" min="0" max="1000" step="0.1" bind:value={page.seed} />
                <label>Frame (s) <input type="number" step="0.05" bind:value={page.time} /></label>
                <input type="range" min="0" max="300" step="0.05" bind:value={page.time} />
            </fieldset>
        {/each}
        <fieldset>
            <legend>Portrait</legend>
            {#each portraitControls as [key, label, min, max, step] (key)}
                <label>{label} <output>{p[key]}</output></label>
                <input type="range" {min} {max} {step} bind:value={p[key]} />
            {/each}
        </fieldset>
        <fieldset>
            <legend>Face, clear of the field</legend>
            {#each faceControls as [key, label, min, max, step] (key)}
                <label>{label} <output>{p[key]}</output></label>
                <input type="range" {min} {max} {step} bind:value={p[key]} />
            {/each}
        </fieldset>
        <fieldset>
            <legend>Values</legend>
            <code>{values}</code>
            <button onclick={() => navigator.clipboard.writeText(values)}>Copy values</button>
        </fieldset>
    </aside>

    <div class="sheets" style:zoom>
        <article class="sheet">
            <div class="field"><canvas bind:this={canvases[0]}></canvas></div>
            <div class="portrait" style:right="{p.right}mm" style:top="{p.top}mm" style:width="{p.width}mm">
                <img src={portrait} alt="Portrait of Mia Riezebos" style:mask-image={mask} />
            </div>
            <!-- The same photo above the field, cut to the face, with the field's haze but not its light. -->
            <div class="portrait face" aria-hidden="true" style:right="{p.right}mm" style:top="{p.top}mm" style:width="{p.width}mm">
                <img src={portrait} alt="" style:mask-image="{mask}, {face}" />
                <div class="haze" style:mask-image="url({portrait}), {mask}, {face}"></div>
            </div>
            <header>
                <h1>Mia<br />Riezebos</h1>
                <p class="role">Product Engineer &amp; Founder</p>
                <ul class="contact">
                    <li>hello@mia.cx</li>
                    <li>mia.cx</li>
                    <li>linkedin.com/in/miariezebos</li>
                    <li>Netherlands</li>
                </ul>
            </header>
            <section class="profile">
                <h2>Profile</h2>
                <p>
                    I'm a product engineer with roots in customer support. I like to understand how things work, from
                    the big picture down to the details, and I love helping people figure out what they need. Through
                    mia.cx I design, build and run my own products. In support, I learned to find the problem behind the
                    question.
                </p>
            </section>
            <section class="timeline">
                <h2>Experience</h2>
                <!-- eslint-disable-next-line svelte/no-at-html-tags -- prototype -->
                <svg viewBox={tlView}>{@html timeline()}</svg>
            </section>
            <section class="pair">
                <div>
                    <h2>Skills</h2>
                    <dl class="skills">
                        <dt>Product</dt><dd>Product discovery, UX and accessibility, technical specs</dd>
                        <dt>Engineering</dt><dd>TypeScript, Svelte/SvelteKit, Cloudflare Workers (D1, R2), WebGPU/WGSL, Swift/SwiftUI</dd>
                        <dt>Infrastructure</dt><dd>Docker, Kubernetes, GitOps</dd>
                        <dt>Support and data</dt><dd>TopDesk, Excel (Power Pivot), Power BI</dd>
                        <dt>Design</dt><dd>Affinity, Adobe Illustrator, Adobe After Effects</dd>
                    </dl>
                </div>
                <div>
                    <h2>Languages</h2>
                    <dl class="skills"><dt>Dutch</dt><dd>Native</dd><dt>English</dt><dd>Fluent</dd></dl>
                </div>
            </section>
        </article>

        <article class="sheet rows">
            <div class="field"><canvas bind:this={canvases[1]}></canvas></div>
            <section class="first">
                <h2>About</h2>
                <div>
                    <p>I care about making things easier to understand and better to use. Complexity should be rare, and where it's needed, it should get the space it needs to be understood.</p>
                    <p>I've worked on both sides of a product: building it, and supporting the people who use it. Support taught me to keep asking until I find the real problem, and to leave people calm and heard, not just helped. Freelancing taught me to speak both languages, turning what a client needs into technical specs and explaining technical constraints back in plain words.</p>
                    <p>I've also handled the people side of projects. For a music collective, I've led several collaborative compilation releases, covering quality assurance, catalogue management, distribution, artist relations and revenue splits, all on tight deadlines.</p>
                    <p>I'm almost entirely self-taught. I studied Music &amp; Technology at HKU and found that formal education doesn't suit me. I learn best through a project I want to build. Because of my ADHD, once I have one, nothing can stop me.</p>
                </div>
            </section>
            <section>
                <h2>Experience</h2>
                <div>
                    <div class="entry"><h3>Junior Support Consultant <span>· Humaris · Sep 2026 – present</span></h3><p>I help advisors, customers of ParaDIGMA groep and their employees use ParaDIGMA's online absenteeism platform, working in TopDesk, Excel and the platform itself.</p></div>
                    <div class="entry"><h3>Founder <span>· mia.cx · Jul 2021 – present</span></h3><p>mia.cx is the umbrella for my products and my freelance design and development work. It started with logos, album covers and motion design for artists and start-ups, and grew into web design and development. In 2023 I launched the hypertrance.eu webshop for nuphory on Shopify and Cloudflare.</p></div>
                    <div class="entry"><h3>Customer Care Agent <span>· ABN AMRO · Nov 2023 – Jul 2025</span></h3><p>I helped clients with their banking every day: about half needed guidance in the mobile app, and the rest ranged from financial questions to complex disputes. After about four months I moved to International Clients, where I worked with clients in English and tracked the team's KPIs. When a slow Power BI dashboard was costing colleagues time, I raised it with my team lead and built a faster version in Excel with Power Pivot, documented so the team could keep using it after I left. I also submitted 44 improvement proposals in two months through an internal feedback channel, each with a problem analysis and a proposed solution.</p></div>
                    <div class="entry"><h3>Call Agent <span>· Teleperformance, for GGD Coronalijn · Feb 2022 – Jul 2022</span></h3><p>I booked COVID test appointments by phone during a period of high call volumes, often for stressed or worried callers, and handled their personal data with care.</p></div>
                    <div class="entry"><h3>Grocery Clerk <span>· Albert Heijn Renkum · Sep 2016 – Mar 2020</span></h3><p>I stocked shelves, received freight from the distribution centres before opening hours, and later worked in the bakery, helping customers on the shop floor along the way. I also earned a company emergency response (BHV) certificate.</p></div>
                </div>
            </section>
            <section>
                <h2>Selected work</h2>
                <ul class="work">
                    <li><b>Caelestis</b>: a template overlay and shared server for groups painting together on wplace.live. <span class="url">caelestis.mia.cx</span></li>
                    <li><b>Discord Wrapped</b>: turns a Discord data package into a report with shareable stories. <span class="url">discordwrapped.app</span></li>
                    <li><b>Vesta</b>: an all-in-one platform for independent musicians, small labels and creative publishers. In development.</li>
                    <li><b>Maal</b>: meal planning for people with ADHD.</li>
                    <li><b>Logitland</b>: a Discord server where only AI agents talk. People watch, and owners adopt agents for an XP bonus. In development.</li>
                </ul>
            </section>
            <section>
                <h2>Education</h2>
                <div>
                    <div class="entry"><h3>Music &amp; Technology <span>· HKU University of the Arts Utrecht · Sep 2020 – Jul 2023 · Discontinued</span></h3></div>
                    <div class="entry"><h3>VWO (pre-university secondary education) <span>· Dorenweerd College · Sep 2012 – Jul 2019</span></h3></div>
                </div>
            </section>
        </article>

        <!-- The Appendix, as /work would print it after the CV. -->
        {#each appendixSheets as items, sheet (sheet)}
        <article class="sheet appendix">
            <div class="field"><canvas bind:this={canvases[2 + sheet]}></canvas></div>
            <section class="first">
                {#if sheet === 0}<h2>Work</h2>{/if}
                <ul>
                    {#each items as item (item.url)}
                        <li>
                            <div>
                                <h3>{item.title}</h3>
                                <p>{item.tagline}</p>
                                <p class="url">{item.url}</p>
                            </div>
                            <svg class="qr" viewBox="0 0 {item.qr.size} {item.qr.size}" aria-hidden="true"><path d={item.qr.path} /></svg>
                        </li>
                    {/each}
                </ul>
            </section>
        </article>
        {/each}
    </div>
</div>

<style>
    .proto { display: grid; grid-template-columns: 320px 1fr; min-height: 100vh; background: #120c11; color: #e9e5dd; font-family: 'Archivo Variable', Archivo, system-ui, sans-serif; }
    aside { position: sticky; top: 0; height: 100vh; overflow: auto; padding: 16px; border-right: 1px solid #2a2228; font-size: 13px; }
    aside h1 { font-size: 14px; margin: 0 0 12px; }
    fieldset { border: 1px solid #2a2228; margin: 0 0 12px; padding: 8px 10px; }
    legend { color: #8f8b85; }
    aside label:has(input[type='radio']) { justify-content: flex-start; }
    aside label { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; }
    aside input[type='range'] { width: 100%; accent-color: #ff3d8a; }
    aside input[type='number'] { width: 90px; background: none; color: inherit; border: 1px solid #2a2228; }
    output { color: #ff3d8a; font-variant-numeric: tabular-nums; }
    code { display: block; font-size: 11px; word-break: break-all; color: #8f8b85; margin-bottom: 8px; }
    button { font: inherit; padding: 6px 12px; border: 1px solid #ff3d8a; background: none; color: #ff3d8a; cursor: pointer; }

    .sheets { display: flex; flex-wrap: wrap; gap: 40px; width: calc(2 * 210mm + 40px + 48px); padding: 24px; align-items: flex-start; }
    .sheet { --accent: #ff3d8a; position: relative; flex: none; width: 210mm; height: 297mm; padding: 14mm 14mm 12mm; overflow: hidden; font-size: 8.6pt; line-height: 1.45; background: var(--paper); color: var(--ink); }
    [data-theme='colour'] .sheet { --paper: #221820; --ink: #e9e5dd; --dim: #8f8b85; --line: rgb(233 229 221 / 0.14); }
    [data-theme='print'] .sheet { --paper: #fff; --ink: #1c161a; --dim: #6e6862; --line: #dcd8d3; }
    .sheet > :not(.field) { position: relative; }

    /*
     * The field floats over the text and the photo, as on the site: its alpha comes from luminance, so only
     * the bright lobes wash over. Colour: full at the top, easing to half below, like the home page as the
     * hero scrolls away; later pages sit at half. Print: only its flares, on white.
     */
    .field { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
    .field canvas { width: 100%; height: 100%; display: block; }
    [data-theme='colour'] .field canvas { mask-image: linear-gradient(to bottom, #000 22%, rgb(0 0 0 / 0.5) 55%); }
    [data-theme='colour'] .rows .field canvas { mask-image: none; opacity: 0.5; }
    [data-theme='print'][data-light='ink'] .field { mix-blend-mode: multiply; }
    [data-theme='print'][data-light='ink'] .field canvas { filter: url(#ink); mask-image: linear-gradient(to bottom, #000 30%, rgb(0 0 0 / 0.25) 60%); }
    [data-theme='print'][data-light='flares'] .field canvas { filter: url(#flares); mask-image: linear-gradient(to bottom, #000 30%, rgb(0 0 0 / 0.25) 60%); }
    [data-theme='print'] .rows .field canvas { opacity: 0.6; }

    .sheet > .portrait { position: absolute; }
    .portrait img { display: block; width: 100%; }
    .sheet > .face { z-index: 3; }
    .face img { mask-composite: intersect; }
    /* Over the photo the field reads as a flat purple wash of about 14%, measured on the home hero. */
    .haze { position: absolute; inset: 0; background: rgb(221 138 231); opacity: 0.14; mask-size: 100% 100%; mask-composite: intersect; }
    [data-theme='print'] .haze { display: none; }

    header { height: 70mm; display: flex; flex-direction: column; justify-content: flex-end; padding-bottom: 5mm; }
    header h1 { margin: 0; font-size: 44pt; line-height: 0.88; font-weight: 660; font-stretch: 70%; letter-spacing: -0.03em; }
    .role { margin: 3mm 0 4mm; font-size: 14pt; font-weight: 500; font-stretch: 76%; color: var(--dim); }
    .contact { display: flex; flex-wrap: wrap; gap: 1mm 5mm; margin: 0; padding: 0; list-style: none; font-size: 8.4pt; }

    h2 { margin: 0 0 2.5mm; font-size: 12pt; font-weight: 650; font-stretch: 76%; letter-spacing: -0.01em; }
    section { border-top: 0.25mm solid var(--line); padding-top: 3mm; margin-top: 4mm; }
    section.first { border-top: 0; margin-top: 0; padding-top: 0; }
    p { margin: 0 0 2mm; }
    .profile p { max-width: 128mm; font-size: 9.6pt; }

    .timeline svg { display: block; width: 100%; height: auto; }
    .timeline :global(.tl-axis) { stroke: var(--ink); }
    .timeline :global(.tl-year) { font-size: 2.3px; fill: var(--dim); }
    .timeline :global(.tl-bar) { stroke: var(--ink); stroke-width: 0.45; }
    .timeline :global(.tl-tail) { stroke: var(--ink); stroke-width: 0.45; stroke-dasharray: 0.8 0.8; }
    [data-theme='colour'] .timeline :global(.tl-tail) { stroke: var(--accent); }
    .timeline :global(.tl-dot) { fill: var(--ink); }
    .timeline :global(.tl-t) { font-size: 3px; font-weight: 650; font-stretch: 85%; fill: var(--ink); }
    .timeline :global(.tl-s) { font-size: 2.2px; fill: var(--dim); }
    .timeline :global(.tl-head) { font-size: 3px; font-weight: 650; fill: var(--dim); }

    .pair { display: grid; grid-template-columns: 1fr 52mm; gap: 8mm; }
    .skills { display: grid; grid-template-columns: max-content 1fr; gap: 1mm 4mm; margin: 0; }
    .skills dt { color: var(--dim); }
    .skills dd { margin: 0; }

    .rows section { display: grid; grid-template-columns: 30mm 1fr; gap: 0 6mm; }
    .rows section h2 { margin: 0; }
    .entry { margin-bottom: 2.6mm; }
    .entry h3 { margin: 0 0 0.6mm; font-size: 9.4pt; font-weight: 650; }
    .entry h3 span { font-weight: 400; color: var(--dim); }
    .work { margin: 0; padding: 0; list-style: none; }
    .work li { margin-bottom: 1mm; }
    .work b { font-weight: 650; }
    .work .url { color: var(--dim); }

    .appendix ul { margin: 0; padding: 0; list-style: none; }
    .appendix li { display: grid; grid-template-columns: 1fr 15mm; gap: 6mm; align-items: start; padding: 2.6mm 0; border-top: 0.25mm solid var(--line); }
    .appendix li:first-child { border-top: 0; padding-top: 0; }
    .appendix h3 { margin: 0 0 0.6mm; font-size: 9.4pt; font-weight: 650; }
    .appendix p { margin: 0 0 0.6mm; }
    .appendix .url { color: var(--dim); }
    /* Above the field, like the face, so its light never lowers the code's contrast. */
    /* Joined like a split button: the second half shares the first's border. */
    .cv-buttons { display: flex; margin-bottom: 16px; }
    .cv-buttons a { display: inline-flex; align-items: center; gap: 12px; height: 40px; padding: 0 12px; border: 1px solid var(--panel-line); background: var(--control); color: var(--ink); font-size: 15px; text-decoration: none; transition: border-color 140ms ease, color 140ms ease; }
    .cv-buttons a + a { margin-left: -1px; }
    .cv-buttons a:hover, .cv-buttons a:focus-visible { position: relative; z-index: 1; border-color: var(--accent); color: var(--accent); }
    /* The icon box is exactly 1cap; Lucide draws in 20 of its 24 units, so the glyph sits a little inside it. */
    .cv-buttons :global(svg) { width: 1cap; height: 1cap; }
    /* Lucide draws at 2; 1.5 matches the weight of the button text. */
    .cv-buttons :global(svg *) { stroke-width: 1.5; }
    .cv-buttons .icon { position: relative; justify-content: center; width: 40px; padding: 0; }
    .doc { position: relative; display: grid; }
    /* The printer sits on the document's corner, cut out of it by the button's own background. */
    .badge { position: absolute; right: -0.35cap; bottom: -0.3cap; display: grid; padding: 1px; background: var(--panel); line-height: 0; }
    .badge :global(svg) { width: 0.65cap; height: 0.65cap; }
    /* Instant: no delay, unlike a title tooltip. */
    .tip { position: absolute; top: calc(100% + 6px); left: 50%; translate: -50% 0; padding: 4px 8px; border: 1px solid var(--panel-line); background: var(--panel); color: var(--ink); font-size: 13px; white-space: nowrap; pointer-events: none; opacity: 0; }
    .icon:hover .tip, .icon:focus-visible .tip { opacity: 1; }

    /* Ink-coloured modules on bare paper: on dark paper they're light, and the paper is the quiet zone. */
    .qr { position: relative; z-index: 3; display: block; width: 15mm; height: 15mm; fill: var(--ink); shape-rendering: crispEdges; }
</style>
