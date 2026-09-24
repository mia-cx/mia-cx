/** One-off: writes the current TypeScript content out as vault notes. Delete after running. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projects } from '../src/lib/content/projects';
import { work as workItems } from '../src/lib/content/work';
// blog.ts uses import.meta.glob, which only exists inside Vite, so the post metadata is inlined here.
const posts = [
    {
        slug: 'the-quiet-cost-of-carelessness',
        title: 'The Quiet Cost of Carelessness',
        date: '2026-05-09',
        summary:
            'AI is a force multiplier for whatever you already do, careful or careless. With the phone it costs you your attention; with AI it costs you your reasoning.',
        external: 'https://www.linkedin.com/pulse/quiet-cost-carelessness-mia-riezebos-unope',
    },
    {
        slug: 'streaming-gear-recommendations',
        title: 'Streaming Gear Recommendations',
        date: '2023-10-28',
        summary: 'Budget gear and the techniques that get the most out of the equipment you already own.',
        source: 'https://github.com/mia-riezebos/mia-riezebos/wiki/Blog:-Streaming-Gear-Recommendations',
    },
    {
        slug: 'flac-vs-wav',
        title: 'FLAC vs. WAV, and what to consider when managing a music library',
        date: '2023-10-27',
        updated: '2023-12-30',
        summary: 'Lossless means lossless. What actually differs between the formats, and what to keep an archive in.',
        source: 'https://github.com/mia-riezebos/mia-riezebos/wiki/Blog:-FLAC-vs.-WAV,-and-Considerations-for-your-Music-Library',
    },
    {
        slug: 'my-approach-to-mastering',
        title: 'My Approach to Mastering',
        date: '2023-09-08',
        updated: '2025-05-18',
        summary: 'A minimal approach, in four parts: spectral consistency, stereo imaging, dynamics and loudness.',
        source: 'https://github.com/mia-riezebos/mia-riezebos/wiki/Blog:-My-Approach-to-Mastering',
    },
    {
        slug: 'software-i-use',
        title: 'Software I Use',
        date: '2023-03-26',
        summary: 'The list, by platform and purpose.',
        source: 'https://github.com/mia-riezebos/mia-riezebos/wiki/Blog:-Software-I-Use',
    },
    {
        slug: 'crunch-time',
        title: 'Crunch Time',
        date: '2023-01-28',
        updated: '2024-05-30',
        summary: 'A missed deadline, procrastination, and the first panic attack of my life.',
        source: 'https://github.com/mia-riezebos/mia-riezebos/wiki/Blog:-Crunch-Time',
    },
] as {
    slug: string;
    title: string;
    date: string;
    updated?: string;
    summary: string;
    external?: string;
    source?: string;
}[];

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vault = resolve(app, '../../vault');

const yamlString = (value: string) => (/[:#\-?*&!|>'"%@`{}[\],]|^\s|\s$/.test(value) ? JSON.stringify(value) : value);
const list = (key: string, values: string[]) =>
    values.length ? `${key}:\n${values.map((value) => `  - ${yamlString(value)}`).join('\n')}\n` : '';
const line = (key: string, value: string | number | undefined) =>
    value === undefined || value === ''
        ? ''
        : `${key}: ${typeof value === 'number' ? value : yamlString(String(value))}\n`;
const stamp = (iso: string | undefined) => (iso ? `${iso}T00:00` : undefined);

const write = (folder: string, title: string, frontmatter: string, body: string) => {
    const dir = resolve(vault, folder);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `${title.replace(/[\\/:*?"<>|]/g, '-')}.md`), `---\n${frontmatter}---\n\n${body}\n`);
};

// Work notes that already have a write-up.
const detailed = new Map(projects.map((project) => [project.title, project]));
for (const item of workItems) {
    const project = detailed.get(item.title);
    const body = project ? [...project.about, ...(project.ethos ?? [])].join('\n\n') : '';
    const frontmatter =
        list(
            'tags',
            item.kinds.map((kind) => `work/${kind}`),
        ) +
        'publish: true\n' +
        line('summary', item.note) +
        line('status', item.status) +
        line('year', item.year) +
        list('stack', item.meta ?? project?.stack ?? []) +
        line('live', project?.live ?? (item.href && !item.slug ? item.href : undefined)) +
        line('source', project?.repo ?? (item.href?.includes('github.com') ? item.href : undefined));
    write('01 - Work', item.title, frontmatter, body);
}

// Posts, carrying their vendored Markdown across unchanged.
for (const post of posts) {
    const file = resolve(app, `src/lib/content/posts/${post.slug}.md`);
    let body = '';
    if (!post.external) {
        body = readFileSync(file, 'utf8')
            .replace(/^\s*#\s+.*\r?\n/, '')
            .trim();
    }
    const frontmatter =
        'tags:\n  - post\n' +
        'publish: true\n' +
        line('summary', post.summary) +
        line('created', stamp(post.date)) +
        line('modified', stamp(post.updated)) +
        line('external', post.external) +
        line('source', post.source);
    write('02 - Blog', post.title, frontmatter, body);
}

console.log(`wrote ${workItems.length} work notes and ${posts.length} posts`);
