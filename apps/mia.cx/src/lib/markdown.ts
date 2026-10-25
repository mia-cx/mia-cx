/**
 * Every page has a Markdown twin one `.md` away: `/` is `/index.md`, `/work/foo` is `/work/foo.md`.
 * src/hooks.server.ts renders them, worker.ts serves them to agents asking for the page itself.
 */

/** Where a page's Markdown lives. */
export const markdownPath = (pathname: string) => `${pathname.replace(/\/$/, '') || '/index'}.md`;

/** The page a Markdown path stands for, or undefined when the path is not one. */
export function pagePath(pathname: string) {
    if (!pathname.endsWith('.md')) return undefined;
    const page = pathname.slice(0, -'.md'.length);
    return page === '/index' ? '/' : page;
}
