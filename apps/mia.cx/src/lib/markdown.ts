/**
 * Every page has a Markdown twin one `.md` away: `/` is `/index.md`, `/work/foo` is `/work/foo.md`.
 * src/hooks.server.ts renders them, worker.ts serves them to agents asking for the page itself.
 */

/** User agents of crawlers and fetchers that read pages on behalf of language models. */
const AGENTS =
    /GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai|PerplexityBot|Perplexity-User|Google-CloudVertexBot|Meta-ExternalAgent|Meta-ExternalFetcher|Amazonbot|Bytespider|CCBot|cohere-ai|DuckAssistBot|MistralAI-User|YouBot|AI2Bot|Diffbot/i;

/** The q-value an `Accept` header gives a media type, or undefined when it does not name it. */
function quality(accept: string, type: string) {
    for (const range of accept.toLowerCase().split(',')) {
        const [name, ...parameters] = range.split(';').map((part) => part.trim());
        if (name !== type) continue;
        const q = parameters.find((parameter) => parameter.startsWith('q='));
        return q ? Number(q.slice('q='.length)) || 0 : 1;
    }
    return undefined;
}

/**
 * Whether a page request should get Markdown. An `Accept` header that names `text/markdown` decides,
 * preferring it unless HTML ranks higher; otherwise AI agents get it by user agent.
 */
export function wantsMarkdown(accept: string, userAgent: string) {
    const markdown = quality(accept, 'text/markdown');
    if (markdown !== undefined) return markdown > 0 && markdown >= (quality(accept, 'text/html') ?? 0);
    return AGENTS.test(userAgent);
}

/** Where a page's Markdown lives. */
export const markdownPath = (pathname: string) => `${pathname.replace(/\/$/, '') || '/index'}.md`;

/** The page a Markdown path stands for, or undefined when the path is not one. */
export function pagePath(pathname: string) {
    if (!pathname.endsWith('.md')) return undefined;
    const page = pathname.slice(0, -'.md'.length);
    return page === '/index' ? '/' : page;
}
