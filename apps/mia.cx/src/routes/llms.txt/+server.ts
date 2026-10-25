import { publishedPosts } from '$lib/content/loaders';
import { site, sitemap } from '$lib/content/site';
import { workWithPages } from '$lib/content/vault';
import { markdownPath } from '$lib/markdown';

export const prerender = true;

const link = (title: string, path: string, summary?: string) =>
    `- [${title}](${site.url}${markdownPath(path)})${summary ? `: ${summary}` : ''}`;

/** The site's map for language models, in the llmstxt.org format, pointing at each page's Markdown. */
export function GET() {
    const sections = [
        [
            'Pages',
            sitemap
                .filter(({ href }) => href.startsWith('/') && !href.includes('#'))
                .map(({ label, href }) => link(label, href)),
        ],
        ['Work', workWithPages.map((note) => link(note.title, `/work/${note.slug}`, note.summary))],
        ['Blog', publishedPosts.map((post) => link(post.title, `/blog/${post.slug}`, post.summary))],
    ] as const;
    const body = [
        `# ${site.name}`,
        `> ${site.description}`,
        ...sections.filter(([, links]) => links.length).map(([title, links]) => `## ${title}\n\n${links.join('\n')}`),
    ].join('\n\n');
    return new Response(`${body}\n`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
