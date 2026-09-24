/**
 * Reads the Obsidian vault at the repository root and emits a typed index for the site.
 *
 * The vault follows Svartz's conventions (frontmatter `title`, `description`, `tags`, `aliases`,
 * `created_at`, `updated_at`, `published`). The index is mia.cx's own format, named after Svartz's:
 * one entry per note, keyed by Svartz's canonical slug, with its links and backlinks. Svartz's index
 * differs in detail (Dates, link objects, plain-text content), so when Svartz ships as a dependency
 * this script becomes an adapter from its index to this one, and the pages stay as they are.
 *
 * What mia.cx publishes is decided by folder: see src/lib/content/sections.ts. Everything
 * Obsidian-specific (wikilinks, embeds, the title-from-filename convention) is resolved here, so
 * the app never has to know it came from a vault.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { format, resolveConfig } from 'prettier';
import {
    SECTIONS,
    isSectionId,
    slugify,
    slugifyHeading,
    svartzSegment,
    svartzSlug,
    type SectionId,
} from '../src/lib/content/sections.ts';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vault = resolve(app, '../../vault');
const assetOut = resolve(app, 'static/vault');
const outFile = resolve(app, 'src/lib/content/vault.generated.ts');

/** Properties promoted to named fields; everything else stays in `frontmatter`. */
const PROMOTED = ['title', 'description', 'tags', 'aliases', 'created_at', 'updated_at', 'published', 'slug'];

interface Note {
    /** Svartz's canonical slug. */
    key: string;
    path: string;
    title: string;
    section: SectionId;
    name: string;
    data: Record<string, unknown>;
    body: string;
}

const problems: string[] = [];
const fail = (file: string, message: string) => problems.push(`${file}: ${message}`);
const warnings: string[] = [];

function walk(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry.startsWith('.')) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, found);
        else found.push(full);
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

/**
 * Svartz's rule: missing means published, and `false` or `""` hides a note. A blank `published:` reads
 * as null, which Svartz would publish; that is almost always a draft, so it stops the build instead.
 */
function isPublished(path: string, data: Record<string, unknown>) {
    if (data.published === null) {
        fail(path, 'has a blank `published`; set it to true or false');
        return false;
    }
    return data.published !== false && data.published !== '';
}

const files = walk(vault);
const rel = (file: string) => relative(vault, file).split('\\').join('/');

// Folders that are sections, from their `_index.md`.
const sectionOf = new Map<string, SectionId>();
for (const file of files.filter((file) => basename(file) === '_index.md')) {
    const slug = matter(readFileSync(file, 'utf8')).data.slug;
    if (slug === undefined) continue;
    if (!isSectionId(slug)) {
        // Another site built from the vault may route it; mia.cx has no pages for it.
        continue;
    }
    const taken = [...sectionOf].find(([, section]) => section === slug);
    if (taken) fail(rel(file), `claims the section "${slug}", already claimed by ${taken[0]}/_index.md`);
    sectionOf.set(rel(dirname(file)), slug);
}

/** The nearest section folder at or above a file, if any. */
function findSection(path: string): SectionId | undefined {
    let dir = dirname(path);
    for (;;) {
        const section = sectionOf.get(dir);
        if (section) return section;
        if (dir === '.' || dir === '') return undefined;
        dir = dirname(dir);
    }
}

const notes: Note[] = [];
for (const file of files) {
    const path = rel(file);
    const name = basename(file);
    if (extname(file) !== '.md' || name === 'README.md' || name === '_index.md') continue;
    const section = findSection(path);
    if (!section) continue;
    const parsed = matter(readFileSync(file, 'utf8'));
    if (!isPublished(path, parsed.data)) continue;
    // The filename is the title unless `title` says otherwise — filenames cannot hold every character.
    const title = parsed.data.title ? String(parsed.data.title) : basename(file, '.md');
    notes.push({
        key: svartzSlug(path),
        path,
        title,
        section,
        // `slug` overrides the title-derived URL, for titles that make an unwieldy one.
        name: parsed.data.slug ? slugify(String(parsed.data.slug)) : slugify(title),
        data: parsed.data,
        body: parsed.content.trim(),
    });
}

/** Every note a wikilink name can mean: filenames, titles and aliases, compared the way Svartz compares them. */
const byLinkName = new Map<string, Set<Note>>();
for (const note of notes) {
    const names = [basename(note.path, '.md'), note.title, ...asList(note.data.aliases)];
    for (const name of names) {
        const key = svartzSegment(name);
        if (!byLinkName.has(key)) byLinkName.set(key, new Set());
        byLinkName.get(key)!.add(note);
    }
}
const byKey = new Map(notes.map((note) => [note.key, note]));

/**
 * The note a wikilink means. `[[folder/Note]]` names a path and resolves exactly; a bare name that
 * could mean more than one note stops the build rather than linking to whichever was read last.
 */
function resolveNote(from: Note, target: string): Note | 'ambiguous' | undefined {
    if (target.includes('/')) {
        const key = target.replace(/\.md$/i, '').split('/').map(svartzSegment).join('/');
        return byKey.get(key);
    }
    const candidates = [...(byLinkName.get(svartzSegment(target)) ?? [])];
    if (candidates.length > 1)
        fail(
            from.path,
            `links to "${target}", which could mean ${candidates.map((note) => note.path).join(' or ')}; link by path, like [[${dirname(candidates[0].path)}/${target}]]`,
        );
    return candidates.length > 1 ? 'ambiguous' : candidates[0];
}

const kindsOf = (note: Note) =>
    asList(note.data.tags)
        .filter((tag) => tag.startsWith('work/'))
        .map((tag) => tag.slice('work/'.length));

/** Where a note lives on the site, or nowhere when it has no page of its own. */
function hrefOf(note: Note): string | undefined {
    if (!SECTIONS[note.section].published) return undefined;
    if (note.section === 'blog' && note.data.external) return String(note.data.external);
    // A work entry with no write-up is a card that links straight out.
    if (!note.body)
        return note.data.live ? String(note.data.live) : note.data.source ? String(note.data.source) : undefined;
    return `/${note.section}/${note.name}`;
}

/**
 * Copy an embedded attachment into static/ and return its URL, or why it has none. The URL keeps the
 * file's vault path, so two attachments with the same name in different folders stay apart.
 */
const assets = new Map<string, string>();
function assetUrl(name: string): { url: string } | { error: string } {
    const cached = assets.get(name);
    if (cached) return { url: cached };
    const byName = files.filter((file) => basename(file) === name);
    const found = files.find((file) => rel(file) === name) ?? (byName.length === 1 ? byName[0] : undefined);
    if (!found)
        return {
            error: byName.length
                ? `embeds "${name}", which could mean ${byName.map(rel).join(' or ')}; embed it by path`
                : `embeds "${name}", which is not in the vault`,
        };
    const path = rel(found);
    mkdirSync(dirname(join(assetOut, path)), { recursive: true });
    copyFileSync(found, join(assetOut, path));
    const url = `/vault/${path.split('/').map(encodeURIComponent).join('/')}`;
    assets.set(name, url);
    return { url };
}

/** Turn Obsidian syntax into plain Markdown the renderer already understands. */
function resolveLinks(note: Note, links: Set<string>): string {
    let body = note.body;

    // ![[image.png]] and ![[image.png|alt]]
    body = body.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (whole, target: string, alt?: string) => {
        const asset = assetUrl(target.trim());
        if ('error' in asset) {
            fail(note.path, asset.error);
            return whole;
        }
        return `![${(alt ?? target).trim()}](${asset.url})`;
    });

    // [[Note]], [[Note|label]], [[Note#Heading]] and [[#Heading]]; an embed that failed above is left alone.
    body = body.replace(
        /(?<!!)\[\[([^\]|#]*)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g,
        (_, target: string, heading?: string, label?: string) => {
            const anchor = heading ? `#${slugifyHeading(heading.trim())}` : '';
            // Like Obsidian, a path link shows only the note's name.
            const text = (label ?? (basename(target.trim()) || heading || '')).trim();
            if (!target.trim()) return anchor ? `[${text}](${anchor})` : text;
            const linked = resolveNote(note, target.trim());
            if (linked === 'ambiguous') return text;
            if (!linked) {
                // Private or unpublished notes, or notes outside mia.cx's sections: text, not a dead link.
                warnings.push(`${note.path}: "${target.trim()}" is not on mia.cx, so it renders as text`);
                return text;
            }
            links.add(linked.key);
            const href = hrefOf(linked);
            if (!href) return text;
            return `[${text}](${href.startsWith('/') ? href + anchor : href})`;
        },
    );

    return body;
}

const entries = notes.map((note) => {
    const links = new Set<string>();
    const content = resolveLinks(note, links);
    if (!note.data.description) fail(note.path, 'has no `description`');
    if (note.section === 'blog' && !asDate(note.data.created_at)) fail(note.path, 'has no valid `created_at` date');
    const frontmatter = Object.fromEntries(Object.entries(note.data).filter(([key]) => !PROMOTED.includes(key)));
    return {
        slug: note.key,
        path: note.path,
        title: note.title,
        tags: asList(note.data.tags),
        aliases: asList(note.data.aliases),
        description: String(note.data.description ?? ''),
        frontmatter,
        content,
        links: [...links],
        createdAt: asDate(note.data.created_at),
        modifiedAt: asDate(note.data.updated_at),
        section: note.section,
        name: note.name,
        href: hrefOf(note),
        kinds: kindsOf(note),
    };
});

const backlinks: Record<string, string[]> = {};
for (const entry of entries)
    for (const target of entry.links) if (target !== entry.slug) (backlinks[target] ??= []).push(entry.slug);

for (const section of Object.keys(SECTIONS) as SectionId[]) {
    const seen = new Map<string, Note>();
    for (const note of notes.filter((note) => note.section === section)) {
        const other = seen.get(note.name);
        if (other) fail(note.path, `collides with ${other.path} on the URL /${section}/${note.name}`);
        seen.set(note.name, note);
    }
    if (![...sectionOf.values()].includes(section))
        warnings.push(`no folder has an _index.md with \`slug: ${section}\`, so /${section} is empty`);
}

if (warnings.length) console.warn(`\nVault notes:\n${warnings.map((warning) => `  - ${warning}`).join('\n')}\n`);
if (problems.length) {
    console.error(`\nVault problems:\n${problems.map((problem) => `  - ${problem}`).join('\n')}\n`);
    process.exit(1);
}

const source = `// Generated from the vault by scripts/generate-content.ts. Do not edit.
/* eslint-disable */
import type { VaultIndex } from './vault';

export const index: VaultIndex = ${JSON.stringify({ entries, backlinks }, null, 4)};
`;

const prettierConfig = await resolveConfig(outFile);
writeFileSync(outFile, await format(source, { ...prettierConfig, filepath: outFile }));
const count = (section: SectionId) => entries.filter((entry) => entry.section === section).length;
console.log(`vault: ${count('work')} work notes, ${count('blog')} posts, ${assets.size} attachments`);
