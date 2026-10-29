import type { Handle } from '@sveltejs/kit';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import { parse } from 'node-html-parser';
import { site } from '$lib/content/site';
import { pagePath } from '$lib/markdown';

/** Chrome that means nothing as text. `data-markdown="skip"` drops anything else. */
const NOT_CONTENT = 'script, style, svg, button, form, [aria-hidden="true"], [data-markdown="skip"]';

/**
 * A page's `<main>` as Markdown, under frontmatter naming the page. Links become absolute so the
 * text still works once it is pasted somewhere else.
 */
function toMarkdown(html: string, url: URL) {
    const document = parse(html);
    const main = document.querySelector('main');
    if (!main) return undefined;
    for (const node of main.querySelectorAll(NOT_CONTENT)) node.remove();
    for (const link of main.querySelectorAll('a[href]')) {
        link.setAttribute('href', new URL(link.getAttribute('href')!, url).href);
        // Icon links are named by their label alone, and the removed icons leave spaces behind.
        const text = link.text.trim()
            ? link.innerHTML.trim()
            : (link.getAttribute('aria-label') ?? link.getAttribute('title') ?? '');
        link.set_content(text);
    }
    for (const image of main.querySelectorAll('img[src]')) {
        image.setAttribute('src', new URL(image.getAttribute('src')!, url).href);
    }
    // Markdown has no definition lists; "Term: detail" reads the same.
    for (const list of main.querySelectorAll('dl')) {
        const items = list
            .querySelectorAll('dt')
            .map((term) => `<li><strong>${term.innerHTML}</strong>: ${term.nextElementSibling?.innerHTML ?? ''}</li>`);
        list.replaceWith(`<ul>${items.join('')}</ul>`);
    }
    const frontmatter = {
        title: document.querySelector('title')?.text,
        description: document.querySelector('meta[name="description"]')?.getAttribute('content'),
        url: url.href,
    };
    const yaml = Object.entries(frontmatter)
        .filter(([, value]) => value)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join('\n');
    return `---\n${yaml}\n---\n\n${NodeHtmlMarkdown.translate(main.innerHTML, { bulletMarker: '-' })}\n`;
}

/**
 * `/<page>.md` renders `/<page>` and converts it, so every page has a Markdown twin without one being
 * written by hand. The links to them on each page get them prerendered alongside the HTML.
 */
export const handle: Handle = async ({ event, resolve }) => {
    const page = pagePath(event.url.pathname);
    if (!page) return resolve(event);

    const response = await event.fetch(page);
    const markdown = response.ok ? toMarkdown(await response.text(), new URL(page, site.url)) : undefined;
    if (!markdown) return new Response('Not found', { status: 404 });
    return new Response(markdown, { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
};
