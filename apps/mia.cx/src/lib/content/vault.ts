/**
 * The site's view of the vault, read from the index Svartz publishes for it (svartz.config.ts).
 * Svartz resolves everything Obsidian-specific and hands over each body as plain Markdown; this
 * module adds what mia.cx needs on top (projects, posts, cards, kinds, outside links, mentions) and
 * renders the Markdown with the site's own renderer.
 *
 * The vault's `work/` folder holds projects: a flat note, or a folder whose `index.md` is the
 * overview. Every other note in a project folder is a post. `blog/` holds the rest of the posts;
 * /blog lists both kinds.
 */
import { marked } from 'marked';
import { vaults } from 'virtual:svartz/host';

/** A top-level folder of the vault, and the section of the site it fills. */
export type SectionId = 'work' | 'blog';
const SECTIONS: readonly string[] = ['work', 'blog'];

export type Kind = 'code' | 'audio' | 'visual';
const KINDS: readonly string[] = ['code', 'audio', 'visual'];

type IndexEntry = (typeof vaults)[number]['artifacts']['index']['entries'][number];

/** One published note in the vault. */
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
    /** The note's own URL on the site, such as `/work/vesta`, whether or not a page is built there. */
    path: string;
    /** Whether the note is a post: anything in `blog/`, or a note inside a project folder. */
    isPost: boolean;
    /** Whether the note is a project folder's `index.md`, the only kind of project that has posts. */
    isFolderNote: boolean;
    /** Where the note lives: its own page, or an outside link. Missing when it has neither. */
    href?: string;
    kinds: string[];
}

export interface Post {
    title: string;
    summary: string;
    /** ISO date, from the note's `created_at` property. */
    date: string;
    /** Set when `updated_at` differs from `created_at`. */
    updated?: string;
    /** Where the index links: the post's page, or `external`. */
    href: string;
    /** Set when the writing lives somewhere else; the index links out and no page is built. */
    external?: string;
    /** Where a vendored copy came from. */
    source?: string;
    /** The project a post in a project folder belongs to. */
    project?: { title: string; href: string };
    /** Whether the post is read aloud, from its `narration` property; posts without it get no audio. */
    narration: boolean;
    entry: VaultEntry;
}

export interface WorkNote {
    /** The URL segment: the project lives at `/work/<slug>`. */
    slug: string;
    title: string;
    summary: string;
    kinds: Kind[];
    status?: string;
    year?: string;
    stack: string[];
    live?: string;
    source?: string;
    /** Whether the project has a page; a bare entry is a card that links straight out. */
    hasPage: boolean;
    /** Shown on the home page. */
    featured: boolean;
    /** Shown on /work; everything else stays in the vault. */
    listed: boolean;
    date: string;
    /** The posts in the project's folder, newest first. */
    posts: Post[];
    entry: VaultEntry;
}

const text = (value: unknown) => (value === undefined || value === null || value === '' ? undefined : String(value));
const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : value ? [String(value)] : []);
/** Svartz's timestamp for a date the note doesn't state: the Unix epoch. */
const UNSTATED = 0;
/** Dates are calendar days at UTC midnight; an unstated date is none. */
const isoDay = (date: Date | undefined) =>
    date && date.getTime() !== UNSTATED ? date.toISOString().slice(0, 10) : undefined;
const newestFirst = (a: { date: string }, b: { date: string }) => b.date.localeCompare(a.date);

const vault = vaults.find((candidate) => candidate.id === 'site');
if (!vault) throw new Error('svartz.config.ts has no "site" vault');
const { index } = vault.artifacts;

const isSection = (folder: string): folder is SectionId => SECTIONS.includes(folder);

function toEntry(entry: IndexEntry): VaultEntry {
    // Svartz's href is the canonical `/<folder>/<name>/`; mia.cx serves it without the trailing slash.
    const path = entry.href.replace(/\/+$/, '');
    const [section, ...rest] = path.split('/').filter(Boolean);
    const where = entry.path;
    if (!isSection(section)) throw new Error(`${where} is outside the vault's work/ and blog/ folders`);
    // blog/<post>, work/<project> or work/<project>/<post>; nothing deeper has a route.
    const isPost = section === 'blog' || rest.length === 2;
    if (rest.length > (section === 'blog' ? 1 : 2)) throw new Error(`${where} is nested too deep to have a page`);
    if (section === 'work' && isPost && !entry.tags.includes('post'))
        throw new Error(`${where} is in a project folder, so it is a post: tag it \`post\``);

    const markdown = entry.markdown?.trim() ?? '';
    // A project folder's index.md always gets a page, to list the folder's posts.
    const isFolderNote = section === 'work' && !isPost && entry.path.split('/').length > 2;
    const hasPage = markdown !== '' || isFolderNote;
    if (!entry.description) throw new Error(`${where} has no \`description\``);
    const createdAt = isoDay(entry.createdAt);
    if (isPost && !createdAt) throw new Error(`${where} has no valid \`created_at\` date`);
    const external = isPost ? text(entry.properties.external) : undefined;
    // A post with neither a body nor an outside link would list a dead entry.
    if (isPost && !hasPage && !external) throw new Error(`${where} has no body and no \`external\` link`);
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
        path,
        isPost,
        isFolderNote,
        // A project with no write-up is a card that links straight out.
        href: external ?? (hasPage ? path : (text(entry.properties.live) ?? text(entry.properties.source))),
        kinds: entry.tags.filter((tag) => tag.startsWith('work/')).map((tag) => tag.slice('work/'.length)),
    };
}

const entries = index.entries.map(toEntry);

const toWork = (entry: VaultEntry): WorkNote => ({
    slug: entry.path.slice('/work/'.length),
    title: entry.title,
    summary: entry.description,
    kinds: entry.kinds.filter((kind): kind is Kind => KINDS.includes(kind)),
    status: text(entry.properties.status),
    // The year on the card falls back to the note's date, so it need not be typed twice.
    year: text(entry.properties.year) ?? entry.createdAt?.slice(0, 4),
    stack: list(entry.properties.stack),
    live: text(entry.properties.live),
    source: text(entry.properties.source),
    hasPage: entry.href === entry.path,
    featured: entry.properties.featured === true,
    listed: entry.properties.listed === true,
    date: entry.createdAt ?? '',
    posts: [],
    entry,
});

/** Every project, newest first. Never their posts. */
export const work: WorkNote[] = entries
    .filter((entry) => entry.section === 'work' && !entry.isPost)
    .map(toWork)
    .sort((a, b) => newestFirst(a, b) || a.title.localeCompare(b.title));

function toPost(entry: VaultEntry): Post {
    const projectPath = entry.section === 'work' ? entry.path.slice(0, entry.path.lastIndexOf('/')) : undefined;
    // A post's project is its folder's index.md. A flat note at the same URL is a project with no posts.
    const project = projectPath && work.find((note) => note.entry.path === projectPath && note.entry.isFolderNote);
    if (projectPath && !project) throw new Error(`${entry.path} is in a project folder with no index.md`);
    const external = text(entry.properties.external);
    return {
        title: entry.title,
        summary: entry.description,
        date: entry.createdAt ?? '',
        updated: entry.modifiedAt && entry.modifiedAt !== entry.createdAt ? entry.modifiedAt : undefined,
        href: external ?? entry.path,
        external,
        source: text(entry.properties.source),
        project: project ? { title: project.title, href: project.entry.path } : undefined,
        narration: entry.properties.narration === true,
        entry,
    };
}

/** Every post, from blog/ and from project folders alike, newest first. */
export const posts: Post[] = entries
    .filter((entry) => entry.isPost)
    .map(toPost)
    .sort(newestFirst);

for (const post of posts) work.find((note) => note.entry.path === post.project?.href)?.posts.push(post);

export const workBySlug = (slug: string) => work.find((note) => note.slug === slug);
/** The post whose page is at this path, if it has one. */
export const postAt = (path: string) => posts.find((post) => post.href === path);

/** Only projects with a page get one; the rest are cards that link straight out. */
export const workWithPages = work.filter((note) => note.hasPage);
export const featuredWork = work.filter((note) => note.featured);
export const listedWork = work.filter((note) => note.listed);

const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));

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

/** Dates are calendar days, read as UTC midnight, so they are formatted in UTC to stay on that day. */
export const formatDate = (iso: string, month: 'short' | 'long' = 'short') =>
    new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month, day: 'numeric', timeZone: 'UTC' });

/** A tag, including any `>` inside its quoted attribute values. */
const TAG = /<(?:[^>"']|"[^"]*"|'[^']*')*>/g;

/** Strips tags to a fixed point, so markup split around another tag can't reassemble. */
function stripTags(html: string) {
    while (new RegExp(TAG).test(html)) html = html.replace(TAG, '');
    return html;
}

/** GitHub's heading ids, which Svartz uses for `[[Note#Heading]]` links: "Slope & Tilt" is `slope--tilt`. */
function headingId(text: string) {
    return stripTags(text)
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
        .replace(/ /g, '-');
}

/** Svartz links to canonical URLs, `/work/vesta/`; the site serves them without the trailing slash. */
const sitePath = (href: string) => href.replace(/^(\/[^?#]*?)\/+(?=[?#]|$)/, '$1');

/** Where a link to each note's URL leads: its page, an outside link, or nowhere. */
const destinations = new Map(entries.map((entry) => [entry.path, entry.href]));

/** A heading in a rendered body, for its table of contents. */
export interface Heading {
    id: string;
    /** The heading as it reads, as HTML: tags stripped, entities kept, so `&amp;` still shows "&". */
    label: string;
    depth: number;
}

/** Renders a body's Markdown with the site's links and heading ids, and lists its headings in order. */
export function render(markdown: string): { html: string; headings: Heading[] } {
    const renderer = new marked.Renderer();
    const link = renderer.link.bind(renderer);
    const seen = new Map<string, number>();
    const headings: Heading[] = [];
    renderer.heading = ({ text: plain, tokens, depth }) => {
        const base = headingId(plain);
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        const id = count === 0 ? base : `${base}-${count}`;
        const content = renderer.parser.parseInline(tokens);
        // An image reads as its alt text, which Marked has already escaped.
        const label = stripTags(content.replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/g, '$1'));
        headings.push({ id, depth, label });
        return `<h${depth} id="${id}">${content}</h${depth}>`;
    };
    renderer.link = (token) => {
        const href = sitePath(token.href);
        const [path] = href.split('#');
        if (!destinations.has(path)) return link({ ...token, href });
        // Svartz links to every note's URL; a note without a page goes where its card goes, or nowhere.
        const destination = destinations.get(path);
        if (destination === path) return link({ ...token, href });
        return destination ? link({ ...token, href: destination }) : renderer.parser.parseInline(token.tokens);
    };
    const html = marked.parse(markdown, { renderer, async: false, gfm: true }) as string;
    return { html, headings };
}
