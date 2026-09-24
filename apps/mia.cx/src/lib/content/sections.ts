/**
 * Which parts of the vault mia.cx publishes, shared by scripts/generate-content.ts and the app.
 *
 * A vault folder becomes a section when it holds an `_index.md` whose frontmatter `slug` names one
 * of these. The folder itself can be called anything, so the vault keeps its ordered directories
 * (`01 - Work`) while the site keeps its URLs (`/work`). Every published note under that folder, at
 * any depth, gets a page at `/<section>/<note>`.
 */
export const SECTIONS = {
    work: { published: true },
    /** Off until the posts are ready: no post pages are built and links to posts render as text. */
    blog: { published: false },
} as const;

export type SectionId = keyof typeof SECTIONS;

export const isSectionId = (value: unknown): value is SectionId =>
    typeof value === 'string' && Object.hasOwn(SECTIONS, value);

/** A note's URL segment inside its section: from its `slug` property, else its title. */
export const slugify = (title: string) =>
    title
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

/**
 * Svartz's canonical slug for one path segment (packages/plugins/src/internal/slug.ts), so entries
 * are keyed the way Svartz keys them and wikilinks resolve the way Svartz resolves them.
 */
export const svartzSegment = (segment: string) =>
    segment
        .replace(/\s/g, '-')
        .replace(/&/g, '-and-')
        .replace(/%/g, '-percent')
        .replace(/\?/g, '')
        .replace(/#/g, '')
        .replace(/-+/g, '-')
        .toLowerCase();

/** Svartz's canonical slug for a vault-relative file: every segment normalised, no extension. */
export const svartzSlug = (path: string) =>
    path
        .replace(/\.[^./]+$/, '')
        .split('/')
        .map(svartzSegment)
        .join('/')
        .replace(/_index$/, 'index');

/** GitHub-style heading anchors, so tables of contents written in Obsidian keep working. */
export const slugifyHeading = (text: string) =>
    text
        .toLowerCase()
        .replace(/<[^>]+>/g, '')
        .replace(/[^\w\- ]+/g, '')
        .trim()
        .replace(/\s+/g, '-');
