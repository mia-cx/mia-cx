/**
 * The Worker in front of SvelteKit's. A page requested by an AI agent, or by anything that prefers
 * `text/markdown`, gets the page's prerendered Markdown twin at the same URL; everything else goes
 * to SvelteKit unchanged.
 */
// @ts-expect-error written by adapter-cloudflare during `vite build`, before wrangler bundles this
import sveltekit from './.svelte-kit/cloudflare/_worker.js';
import { markdownPath, wantsMarkdown } from './src/lib/markdown';

interface Env {
    ASSETS: { fetch: typeof fetch };
}

/** A path with an extension is a file, not a page. */
const isPage = (pathname: string) => !/\.[^/]+$/.test(pathname);

export default {
    async fetch(request: Request, env: Env, ctx: unknown): Promise<Response> {
        const url = new URL(request.url);
        // Twins asked for by name get the same headers; assets alone would send no charset.
        const twin = url.pathname.endsWith('.md')
            ? url.pathname
            : isPage(url.pathname) &&
                wantsMarkdown(request.headers.get('accept') ?? '', request.headers.get('user-agent') ?? '')
              ? markdownPath(url.pathname)
              : undefined;
        if (twin) {
            const markdown = await env.ASSETS.fetch(new URL(twin, url));
            if (markdown.ok) {
                return new Response(markdown.body, {
                    headers: { 'content-type': 'text/markdown; charset=utf-8', vary: 'Accept, User-Agent' },
                });
            }
        }

        const response: Response = await sveltekit.fetch(request, env, ctx);
        if (!response.headers.get('content-type')?.startsWith('text/html')) return response;
        const varied = new Response(response.body, response);
        varied.headers.append('vary', 'Accept, User-Agent');
        return varied;
    },
};
