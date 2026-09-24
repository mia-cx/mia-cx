/**
 * The site's view of the vault. `vault.generated.ts` is produced by scripts/generate-content.ts;
 * everything Obsidian-specific has already been resolved by the time it gets here.
 */
import { marked } from 'marked';
import { slugifyHeading, type SectionId } from './sections';
import { index as generatedIndex } from './vault.generated';

export type Kind = 'code' | 'audio' | 'visual';
const KINDS: readonly string[] = ['code', 'audio', 'visual'];

/**
 * One published note in a mia.cx section. The first block mirrors Svartz's `IndexEntry`
 * (packages/core/src/types.ts), with dates as ISO strings; the rest is what mia.cx adds.
 */
export interface VaultEntry {
    /** Svartz's canonical slug: the vault-relative path, normalised. */
    slug: string;
    path: string;
    title: string;
    tags: string[];
    aliases: string[];
    description: string;
    /** The note's own properties, minus those promoted to fields above. */
    frontmatter: Record<string, unknown>;
    /** Markdown with wikilinks and embeds already turned into site links. */
    content: string;
    /** Canonical slugs of the section notes this one links to. */
    links: string[];
    createdAt?: string;
    modifiedAt?: string;

    section: SectionId;
    /** The URL segment inside the section. */
    name: string;
    /** Where the note lives: its own page, or an outside link. Missing when it has neither. */
    href?: string;
    kinds: string[];
}

export interface VaultIndex {
    entries: VaultEntry[];
    /** Canonical slug → the canonical slugs of the notes linking to it. */
    backlinks: Record<string, string[]>;
}

export const index: VaultIndex = generatedIndex;

export interface Post {
    slug: string;
    title: string;
    summary: string;
    /** ISO date, from the note's `created_at` property. */
    date: string;
    /** Set when `updated_at` differs from `created_at`. */
    updated?: string;
    /** Set when the writing lives somewhere else; the index links out and no page is built. */
    external?: string;
    /** Where a vendored copy came from. */
    source?: string;
    markdown: string;
    entry: VaultEntry;
}

export interface WorkNote {
    slug: string;
    title: string;
    summary: string;
    kinds: Kind[];
    status?: string;
    year?: string;
    stack: string[];
    live?: string;
    source?: string;
    /** Empty when the note is a bare entry with no write-up, so it gets no page of its own. */
    markdown: string;
    /** Shown on the home page. */
    featured: boolean;
    /** Shown on /work; everything else stays in the vault. */
    listed: boolean;
    date: string;
    entry: VaultEntry;
}

const text = (value: unknown) => (value === undefined || value === null || value === '' ? undefined : String(value));
const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : value ? [String(value)] : []);

const toPost = (entry: VaultEntry): Post => ({
    slug: entry.name,
    title: entry.title,
    summary: entry.description,
    date: entry.createdAt ?? '',
    updated: entry.modifiedAt && entry.modifiedAt !== entry.createdAt ? entry.modifiedAt : undefined,
    external: text(entry.frontmatter.external),
    source: text(entry.frontmatter.source),
    markdown: entry.frontmatter.external ? '' : entry.content,
    entry,
});

const toWork = (entry: VaultEntry): WorkNote => ({
    slug: entry.name,
    title: entry.title,
    summary: entry.description,
    kinds: entry.kinds.filter((kind): kind is Kind => KINDS.includes(kind)),
    status: text(entry.frontmatter.status),
    // The year on the card falls back to the note's date, so it need not be typed twice.
    year: text(entry.frontmatter.year) ?? entry.createdAt?.slice(0, 4),
    stack: list(entry.frontmatter.stack),
    live: text(entry.frontmatter.live),
    source: text(entry.frontmatter.source),
    markdown: entry.content,
    featured: entry.frontmatter.featured === true,
    listed: entry.frontmatter.listed === true,
    date: entry.createdAt ?? '',
    entry,
});

const inSection = (section: SectionId) => index.entries.filter((entry) => entry.section === section);

export const posts: Post[] = inSection('blog')
    .map(toPost)
    .sort((a, b) => b.date.localeCompare(a.date));
export const work: WorkNote[] = inSection('work')
    .map(toWork)
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

export const postBySlug = (slug: string) => posts.find((post) => post.slug === slug);
export const workBySlug = (slug: string) => work.find((note) => note.slug === slug);

/** Only notes with a body get a page; the rest are cards that link straight out. */
export const workWithPages = work.filter((note) => note.markdown !== '');
export const featuredWork = work.filter((note) => note.featured);
export const listedWork = work.filter((note) => note.listed);

const bySlug = new Map(index.entries.map((entry) => [entry.slug, entry]));

/** Notes on the site that link to this one, for a "Mentioned in" list. */
export const mentionsOf = (entry: VaultEntry) =>
    (index.backlinks[entry.slug] ?? [])
        .map((slug) => bySlug.get(slug))
        .filter((linking): linking is VaultEntry & { href: string } => !!linking?.href);

export const kindLabels: Record<Kind | 'all', string> = {
    all: 'Everything',
    code: 'Code',
    audio: 'Audio',
    visual: 'Visual',
};

export const countByKind = (kind: Kind | 'all') =>
    kind === 'all' ? work.length : work.filter((note) => note.kinds.includes(kind)).length;

/** Mixed-case in-page anchors, and a couple that lost their leading '#', still need to resolve. */
function normaliseAnchors(markdown: string): string {
    return markdown
        .replace(/\]\(#([^)]+)\)/g, (_, fragment: string) => `](#${slugifyHeading(fragment.replace(/-/g, ' '))})`)
        .replace(
            /\]\((?!https?:|\/|#|mailto:)([\w-]+)\)/g,
            (_, fragment: string) => `](#${slugifyHeading(fragment.replace(/-/g, ' '))})`,
        );
}

export function render(markdown: string): string {
    const renderer = new marked.Renderer();
    const seen = new Map<string, number>();
    renderer.heading = ({ text: plain, tokens, depth }) => {
        const text = renderer.parser.parseInline(tokens);
        const base = slugifyHeading(plain);
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        const id = count === 0 ? base : `${base}-${count}`;
        // The page renders its own H1, so everything in the body starts a level down.
        const level = Math.min(depth + 1, 6);
        return `<h${level} id="${id}">${text}</h${level}>`;
    };
    return marked.parse(normaliseAnchors(markdown), { renderer, async: false, gfm: true }) as string;
}

export const formatDate = (iso: string, month: 'short' | 'long' = 'short') =>
    new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month, day: 'numeric' });
