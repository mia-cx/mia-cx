import { describe, expect, it, vi } from 'vitest';
import { render } from './vault';

vi.mock('virtual:svartz/host', () => ({
    vaults: [{ id: 'site', artifacts: { index: { entries: [], backlinks: {} } } }],
}));

/** A note as Svartz indexes it, with the fields mia.cx reads. */
const note = (
    path: string,
    href: string,
    overrides: {
        tags?: string[];
        date?: string;
        updated?: string;
        markdown?: string;
        properties?: Record<string, unknown>;
    } = {},
) => ({
    slug: href.replace(/^\/|\/$/g, ''),
    href,
    path,
    properties: overrides.properties ?? {},
    // Svartz titles a note by its filename, and a folder's index.md by the folder.
    title: path
        .replace(/\/index\.md$|\.md$/, '')
        .split('/')
        .at(-1),
    tags: overrides.tags ?? [],
    description: `About ${path}`,
    markdown: overrides.markdown ?? 'Body.',
    createdAt: overrides.date ? new Date(overrides.date) : undefined,
    modifiedAt: overrides.updated ? new Date(overrides.updated) : undefined,
});

/** The vault module, built from these notes. */
async function vaultOf(entries: ReturnType<typeof note>[]) {
    vi.resetModules();
    vi.doMock('virtual:svartz/host', () => ({
        vaults: [{ id: 'site', artifacts: { index: { entries, backlinks: {} } } }],
    }));
    return import('./vault');
}

describe('projects and posts', () => {
    const vault = () =>
        vaultOf([
            note('work/Maal.md', '/work/maal/', { date: '2025-01-01' }),
            note('work/Tastebase/index.md', '/work/tastebase/', { date: '2024-06-01', markdown: '' }),
            note('work/Tastebase/Redacting names.md', '/work/tastebase/redacting-names/', {
                tags: ['post'],
                date: '2026-03-01',
            }),
            note('work/Tastebase/First import.md', '/work/tastebase/first-import/', {
                tags: ['post'],
                date: '2026-01-01',
            }),
            note('blog/Crunch Time.md', '/blog/crunch-time/', { tags: ['post'], date: '2026-02-01' }),
        ]);

    it('keeps posts out of /work and lists each project folder at its own page', async () => {
        const { work, workBySlug } = await vault();
        expect(work.map((project) => project.slug)).toEqual(['maal', 'tastebase']);
        // A folder note with no body still gets a page, to list its posts.
        expect(workBySlug('tastebase')).toMatchObject({ hasPage: true, entry: { href: '/work/tastebase' } });
        expect(workBySlug('tastebase')!.posts.map((post) => post.href)).toEqual([
            '/work/tastebase/redacting-names',
            '/work/tastebase/first-import',
        ]);
    });

    it('lists project posts on /blog by date, at their page under the project', async () => {
        const { posts, postAt } = await vault();
        expect(posts.map((post) => post.href)).toEqual([
            '/work/tastebase/redacting-names',
            '/blog/crunch-time',
            '/work/tastebase/first-import',
        ]);
        expect(postAt('/work/tastebase/redacting-names')!.project).toEqual({
            title: 'Tastebase',
            href: '/work/tastebase',
        });
        expect(postAt('/blog/crunch-time')!.project).toBeUndefined();
    });

    it('shows an update date only when it differs from the post date', async () => {
        const { posts } = await vaultOf([
            note('blog/Edited.md', '/blog/edited/', { tags: ['post'], date: '2026-01-01', updated: '2026-02-01' }),
            note('blog/Same day.md', '/blog/same-day/', { tags: ['post'], date: '2025-01-01', updated: '2025-01-01' }),
        ]);
        expect(posts.map((post) => post.updated)).toEqual(['2026-02-01', undefined]);
    });

    it.each([
        [
            'a project post has no date',
            note('work/Tastebase/Undated.md', '/work/tastebase/undated/', { tags: ['post'] }),
        ],
        ['a note in a project folder is not tagged post', note('work/Tastebase/Notes.md', '/work/tastebase/notes/')],
    ])('fails the build when %s', async (_, broken) => {
        await expect(
            vaultOf([note('work/Tastebase/index.md', '/work/tastebase/', { date: '2024-06-01' }), broken]),
        ).rejects.toThrow('work/Tastebase/');
    });

    it('fails the build when a post sits in a folder with no index.md, beside a flat project', async () => {
        await expect(
            vaultOf([
                note('work/Tastebase.md', '/work/tastebase/', { date: '2024-06-01' }),
                note('work/Tastebase/First import.md', '/work/tastebase/first-import/', {
                    tags: ['post'],
                    date: '2026-01-01',
                }),
            ]),
        ).rejects.toThrow('/work/tastebase/first-import is in a project folder with no index.md');
    });
});

describe('links between notes', () => {
    it('send a link to a note without a page where its card goes, or leave plain text', async () => {
        const { render } = await vaultOf([
            note('work/Maal.md', '/work/maal/', { date: '2025-01-01' }),
            note('work/Theme.md', '/work/theme/', { markdown: '', properties: { live: 'https://theme.dev' } }),
            note('work/Sketch.md', '/work/sketch/', { markdown: '' }),
        ]);
        const { html } = render('[Maal](/work/maal/) [Theme](/work/theme/) [Sketch](/work/sketch/#idea)');
        expect(html).toContain('<a href="/work/maal">Maal</a>');
        expect(html).toContain('<a href="https://theme.dev">Theme</a>');
        expect(html).toContain(' Sketch</p>');
    });
});

describe('heading ids', () => {
    it('preserves GitHub-style ids, inline markup and duplicate suffixes', () => {
        const { html } = render('# Slope & Tilt\n\n# <em>Slope & Tilt</em>');
        expect(html).toContain('<h1 id="slope--tilt">Slope &amp; Tilt</h1>');
        expect(html).toContain('<h1 id="slope--tilt-1"><em>Slope &amp; Tilt</em></h1>');
    });

    it('lists the headings in order, without their markup, under the ids they link to', () => {
        const { headings } = render('## *Slope* & Tilt\n\ntext\n\n### <em>Low</em>-end\n\n## Slope &amp; Tilt');
        expect(headings).toEqual([
            { id: 'slope--tilt', label: 'Slope &amp; Tilt', depth: 2 },
            { id: 'low-end', label: 'Low-end', depth: 3 },
            { id: 'slope-amp-tilt', label: 'Slope &amp; Tilt', depth: 2 },
        ]);
    });

    it.each([
        ['# <scr<script>ipt>Heading', 'iptheading'],
        ['# <script', 'script'],
    ])('keeps malformed markup out of heading ids: %s', (markdown, id) => {
        expect(render(markdown).html).toContain(`<h1 id="${id}">`);
    });
});
