/**
 * The site's view of the vaults, read from the index Svartz publishes for each mount
 * (svartz.config.ts). Svartz resolves everything Obsidian-specific and hands over each body as
 * plain Markdown; this module adds what mia.cx needs on top (cards, kinds, outside links,
 * mentions) and renders the Markdown with the site's own renderer.
 */
import { marked } from 'marked';
import { vaults } from 'virtual:svartz/host';

/** A vault in svartz.config.ts, by id, and the section of the site it fills. */
export type SectionId = 'work' | 'blog';

export type Kind = 'code' | 'audio' | 'visual';
const KINDS: readonly string[] = ['code', 'audio', 'visual'];

type IndexEntry = (typeof vaults)[number]['artifacts']['index']['entries'][number];

/** One published note in a mia.cx section. */
export interface VaultEntry {
    /** Svartz's canonical slug: the vault-relative path, normalised. */
    slug: string;
    title: string;
    tags: string[];
    description: string;
    /** The note's published properties. */
    properties: Record<string, unknown>;
    /** The body as Markdown, links resolved by Svartz. Empty for a bare entry with no page of its own. */
    markdown: string;
    createdAt?: string;
    modifiedAt?: string;

    section: SectionId;
    /** The URL segment inside the section. */
    name: string;
    /** Where the note lives: its own page, or an outside link. Missing when it has neither. */
    href?: string;
    kinds: string[];
}

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
    /** Whether the note has a write-up; a bare entry gets no page of its own. */
    hasPage: boolean;
    /** Shown on the home page. */
    featured: boolean;
    /** Shown on /work; everything else stays in the vault. */
    listed: boolean;
    date: string;
    entry: VaultEntry;
}

const text = (value: unknown) => (value === undefined || value === null || value === '' ? undefined : String(value));
const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : value ? [String(value)] : []);
/** Dates are calendar days at UTC midnight. */
const isoDay = (date: Date | undefined) => date?.toISOString().slice(0, 10);

function sectionVault(section: SectionId) {
    const vault = vaults.find((candidate) => candidate.id === section);
    if (!vault) throw new Error(`svartz.config.ts has no "${section}" vault`);
    return vault;
}

/** Where a note lives on the site, or nowhere when it has no page of its own. */
function hrefOf(section: SectionId, name: string, entry: IndexEntry, hasBody: boolean): string | undefined {
    const { properties } = entry;
    if (section === 'blog' && properties.external) return String(properties.external);
    // A work entry with no write-up is a card that links straight out.
    if (!hasBody) return text(properties.live) ?? text(properties.source);
    return `/${section}/${name}`;
}

function toEntry(section: SectionId, entry: IndexEntry): VaultEntry {
    // Svartz's href is `/<mount>/<name>/`; mia.cx serves the same page without the trailing slash.
    const name = entry.href.replace(/\/+$/, '').split('/').pop()!;
    const markdown = entry.markdown?.trim() ?? '';
    const hasBody = markdown !== '';
    const where = `${section}/${entry.path}`;
    if (!entry.description) throw new Error(`${where} has no \`description\``);
    const createdAt = isoDay(entry.createdAt);
    if (section === 'blog' && !createdAt) throw new Error(`${where} has no valid \`created_at\` date`);
    return {
        slug: entry.slug,
        title: entry.title,
        tags: [...entry.tags],
        description: entry.description,
        properties: entry.properties,
        markdown,
        createdAt,
        modifiedAt: isoDay(entry.modifiedAt),
        section,
        name,
        href: hrefOf(section, name, entry, hasBody),
        kinds: entry.tags.filter((tag) => tag.startsWith('work/')).map((tag) => tag.slice('work/'.length)),
    };
}

const entriesOf = (section: SectionId) =>
    sectionVault(section).artifacts.index.entries.map((entry) => toEntry(section, entry));

const toPost = (entry: VaultEntry): Post => ({
    slug: entry.name,
    title: entry.title,
    summary: entry.description,
    date: entry.createdAt ?? '',
    updated: entry.modifiedAt && entry.modifiedAt !== entry.createdAt ? entry.modifiedAt : undefined,
    external: text(entry.properties.external),
    source: text(entry.properties.source),
    entry,
});

const toWork = (entry: VaultEntry): WorkNote => ({
    slug: entry.name,
    title: entry.title,
    summary: entry.description,
    kinds: entry.kinds.filter((kind): kind is Kind => KINDS.includes(kind)),
    status: text(entry.properties.status),
    // The year on the card falls back to the note's date, so it need not be typed twice.
    year: text(entry.properties.year) ?? entry.createdAt?.slice(0, 4),
    stack: list(entry.properties.stack),
    live: text(entry.properties.live),
    source: text(entry.properties.source),
    hasPage: entry.markdown !== '',
    featured: entry.properties.featured === true,
    listed: entry.properties.listed === true,
    date: entry.createdAt ?? '',
    entry,
});

export const posts: Post[] = entriesOf('blog')
    .map(toPost)
    .sort((a, b) => b.date.localeCompare(a.date));
export const work: WorkNote[] = entriesOf('work')
    .map(toWork)
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

export const postBySlug = (slug: string) => posts.find((post) => post.slug === slug);
export const workBySlug = (slug: string) => work.find((note) => note.slug === slug);

/** Only notes with a body get a page; the rest are cards that link straight out. */
export const workWithPages = work.filter((note) => note.hasPage);
export const featuredWork = work.filter((note) => note.featured);
export const listedWork = work.filter((note) => note.listed);

const bySlug = new Map(
    [...work.map((note) => note.entry), ...posts.map((post) => post.entry)].map((entry) => [
        `${entry.section}:${entry.slug}`,
        entry,
    ]),
);

/** Notes on the site that link to this one, for a "Mentioned in" list. Svartz links within one vault. */
export const mentionsOf = (entry: VaultEntry) =>
    (sectionVault(entry.section).artifacts.index.backlinks[entry.slug] ?? [])
        .map((slug) => bySlug.get(`${entry.section}:${slug}`))
        .filter((linking): linking is VaultEntry & { href: string } => !!linking?.href);

export const kindLabels: Record<Kind | 'all', string> = {
    all: 'Everything',
    code: 'Code',
    audio: 'Audio',
    visual: 'Visual',
};

export const countByKind = (kind: Kind | 'all') =>
    kind === 'all' ? work.length : work.filter((note) => note.kinds.includes(kind)).length;

/** Dates are calendar days, read as UTC midnight, so they are formatted in UTC to stay on that day. */
export const formatDate = (iso: string, month: 'short' | 'long' = 'short') =>
    new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month, day: 'numeric', timeZone: 'UTC' });

/** GitHub's heading ids, which Svartz uses for `[[Note#Heading]]` links: "Slope & Tilt" is `slope--tilt`. */
function headingId(text: string) {
    // Strip tags to a fixed point before normalising the heading id.
    while (/<[^>]*>/.test(text)) text = text.replace(/<[^>]*>/g, '');
    return text
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
        .replace(/ /g, '-');
}

/** Svartz links to canonical URLs, `/work/vesta/`; the site serves them without the trailing slash. */
const sitePath = (href: string) => href.replace(/^(\/[^?#]*?)\/+(?=[?#]|$)/, '$1');

export function render(markdown: string): string {
    const renderer = new marked.Renderer();
    const link = renderer.link.bind(renderer);
    const seen = new Map<string, number>();
    renderer.heading = ({ text: plain, tokens, depth }) => {
        const base = headingId(plain);
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        const id = count === 0 ? base : `${base}-${count}`;
        return `<h${depth} id="${id}">${renderer.parser.parseInline(tokens)}</h${depth}>`;
    };
    renderer.link = (token) => link({ ...token, href: sitePath(token.href) });
    return marked.parse(markdown, { renderer, async: false, gfm: true }) as string;
}
