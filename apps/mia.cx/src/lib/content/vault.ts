/**
 * The site's view of the vault. `vault.generated.ts` is produced by scripts/generate-content.ts;
 * everything Obsidian-specific has already been resolved by the time it gets here.
 */
import { marked } from 'marked';
import { posts as generatedPosts, work as generatedWork } from './vault.generated';

export type Kind = 'code' | 'audio' | 'visual';

export interface Post {
    slug: string;
    title: string;
    summary: string;
    /** ISO date, from the note's `created` property. */
    date: string;
    /** Set when `modified` differs from `created`. */
    updated?: string;
    /** Set when the writing lives somewhere else; the index links out and no page is built. */
    external?: string;
    /** Where a vendored copy came from. */
    source?: string;
    markdown: string;
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
    /** Shown on /work; everything else stays in the vault until Svartz publishes it. */
    listed: boolean;
    date: string;
}

export const posts: Post[] = generatedPosts;
export const work: WorkNote[] = generatedWork;

export const postBySlug = (slug: string) => posts.find((post) => post.slug === slug);
export const workBySlug = (slug: string) => work.find((note) => note.slug === slug);

/** Only notes with a body get a page; the rest are cards that link straight out. */
export const workWithPages = work.filter((note) => note.markdown !== '');
export const featuredWork = work.filter((note) => note.featured);
export const listedWork = work.filter((note) => note.listed);

export const kindLabels: Record<Kind | 'all', string> = {
    all: 'Everything',
    code: 'Code',
    audio: 'Audio',
    visual: 'Visual',
};

export const countByKind = (kind: Kind | 'all') =>
    kind === 'all' ? work.length : work.filter((note) => note.kinds.includes(kind)).length;

/** GitHub-style heading anchors, so tables of contents written in Obsidian keep working. */
const slugifyHeading = (text: string) =>
    text
        .toLowerCase()
        .replace(/<[^>]+>/g, '')
        .replace(/[^\w\- ]+/g, '')
        .trim()
        .replace(/\s+/g, '-');

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
