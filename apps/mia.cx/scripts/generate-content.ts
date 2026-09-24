/**
 * Reads the Obsidian vault at the repository root and emits typed content for the site.
 *
 * Notes are selected by frontmatter, never by folder, so Mia can file them wherever her vault
 * taxonomy puts them. Everything Obsidian-specific — wikilinks, embeds, the title-from-filename
 * convention — is resolved here, so the app never has to know it came from a vault.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { format, resolveConfig } from 'prettier';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vault = resolve(app, '../../vault');
const assetOut = resolve(app, 'static/vault');
const outFile = resolve(app, 'src/lib/content/vault.generated.ts');

const KINDS = ['code', 'audio', 'visual'] as const;
type Kind = (typeof KINDS)[number];

interface Note {
    slug: string;
    title: string;
    file: string;
    data: Record<string, unknown>;
    body: string;
}

const problems: string[] = [];
const fail = (file: string, message: string) => problems.push(`${file}: ${message}`);

/** Obsidian titles are filenames, and the slug follows from the title so renames rename the URL. */
const slugify = (title: string) =>
    title
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

function walk(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry.startsWith('.')) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, found);
        else if (extname(full) === '.md') found.push(full);
    }
    return found;
}

const asList = (value: unknown): string[] =>
    value === undefined || value === null ? [] : Array.isArray(value) ? value.map(String) : [String(value)];

const asDate = (value: unknown): string | undefined => {
    if (!value) return undefined;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
};

const notes: Note[] = [];
for (const file of walk(vault)) {
    const relative = file.slice(vault.length + 1);
    if (basename(file) === 'README.md') continue;
    const parsed = matter(readFileSync(file, 'utf8'));
    if (parsed.data.publish !== true) continue;
    // The filename is the title unless `title` says otherwise — filenames cannot hold every character.
    const title = parsed.data.title ? String(parsed.data.title) : basename(file, '.md');
    // `slug` overrides the title-derived URL, for titles that make an unwieldy one.
    const slug = parsed.data.slug ? slugify(String(parsed.data.slug)) : slugify(title);
    notes.push({ slug, title, file: relative, data: parsed.data, body: parsed.content.trim() });
}

const bySlug = new Map(notes.map((note) => [note.slug, note]));
const byTitle = new Map(notes.map((note) => [note.title.toLowerCase(), note]));

const isPost = (note: Note) => asList(note.data.tags).includes('post');
const kindsOf = (note: Note): Kind[] =>
    asList(note.data.tags)
        .filter((tag) => tag.startsWith('work/'))
        .map((tag) => tag.slice('work/'.length))
        .filter((kind): kind is Kind => (KINDS as readonly string[]).includes(kind));

/** Copy an embedded attachment into static/ and return the URL the site should use. */
const assets = new Map<string, string>();
function assetUrl(name: string): string | undefined {
    const cached = assets.get(name);
    if (cached) return cached;
    const matches = walk(vault, [])
        .filter(() => false)
        .concat([]);
    void matches;
    const found = findAsset(vault, name);
    if (!found) return undefined;
    mkdirSync(assetOut, { recursive: true });
    copyFileSync(found, join(assetOut, basename(found)));
    const url = `/vault/${basename(found)}`;
    assets.set(name, url);
    return url;
}

function findAsset(dir: string, name: string): string | undefined {
    for (const entry of readdirSync(dir)) {
        if (entry.startsWith('.')) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            const nested = findAsset(full, name);
            if (nested) return nested;
        } else if (entry === name) return full;
    }
    return undefined;
}

/** Turn Obsidian syntax into plain Markdown the renderer already understands. */
function resolveLinks(note: Note): string {
    let body = note.body;

    // ![[image.png]] and ![[image.png|alt]]
    body = body.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (whole, target: string, alt?: string) => {
        const url = assetUrl(target.trim());
        if (!url) {
            fail(note.file, `embeds "${target.trim()}", which is not in the vault`);
            return whole;
        }
        return `![${(alt ?? target).trim()}](${url})`;
    });

    // [[Note]] and [[Note|label]]
    body = body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (whole, target: string, label?: string) => {
        const linked = byTitle.get(target.trim().toLowerCase());
        if (!linked) {
            fail(note.file, `links to "${target.trim()}", which is not a published note`);
            return whole;
        }
        // Post pages are parked until Svartz publishes them, so a post link only works if the post
        // lives somewhere else already; anything else would be a 404.
        if (isPost(linked) && !linked.data.external) {
            fail(note.file, `links to the post "${linked.title}", which has no page yet`);
            return whole;
        }
        const href = isPost(linked) ? String(linked.data.external) : `/work/${linked.slug}`;
        return `[${(label ?? linked.title).trim()}](${href})`;
    });

    return body;
}

const posts = notes
    .filter(isPost)
    .map((note) => {
        if (!note.data.summary) fail(note.file, 'has no `summary`');
        if (!asDate(note.data.created)) fail(note.file, 'has no valid `created` date');
        const created = asDate(note.data.created);
        const modified = asDate(note.data.modified);
        return {
            slug: note.slug,
            title: note.title,
            summary: String(note.data.summary ?? ''),
            date: created ?? '',
            updated: modified && modified !== created ? modified : undefined,
            external: note.data.external ? String(note.data.external) : undefined,
            source: note.data.source ? String(note.data.source) : undefined,
            markdown: note.data.external ? '' : resolveLinks(note),
        };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

const work = notes
    .filter((note) => kindsOf(note).length > 0)
    .map((note) => {
        if (!note.data.summary) fail(note.file, 'has no `summary`');
        return {
            slug: note.slug,
            title: note.title,
            summary: String(note.data.summary ?? ''),
            kinds: kindsOf(note),
            status: note.data.status ? String(note.data.status) : undefined,
            // The year on the card falls back to the note's date, so it need not be typed twice.
            year: note.data.year ? String(note.data.year) : asDate(note.data.created)?.slice(0, 4),
            stack: asList(note.data.stack),
            live: note.data.live ? String(note.data.live) : undefined,
            source: note.data.source ? String(note.data.source) : undefined,
            /** Present only when the note has a body worth a page of its own. */
            markdown: note.body ? resolveLinks(note) : '',
            featured: note.data.featured === true,
            listed: note.data.listed === true,
            date: asDate(note.data.created) ?? '',
        };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

for (const note of notes)
    if (!isPost(note) && kindsOf(note).length === 0)
        fail(note.file, 'is published but tagged neither `post` nor `work/{code,audio,visual}`');

const duplicates = notes.filter((note) => bySlug.get(note.slug) !== note);
for (const note of duplicates) fail(note.file, `collides with another note on the slug "${note.slug}"`);

if (problems.length) {
    console.error(`\nVault problems:\n${problems.map((problem) => `  - ${problem}`).join('\n')}\n`);
    process.exit(1);
}

const source = `// Generated from the vault by scripts/generate-content.ts. Do not edit.
/* eslint-disable */
import type { Post, WorkNote } from './vault';

export const posts: Post[] = ${JSON.stringify(posts, null, 4)};

export const work: WorkNote[] = ${JSON.stringify(work, null, 4)};
`;

const prettierConfig = await resolveConfig(outFile);
writeFileSync(outFile, await format(source, { ...prettierConfig, filepath: outFile }));
console.log(`vault: ${work.length} work notes, ${posts.length} posts, ${assets.size} attachments`);
