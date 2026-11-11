import { publishedPosts } from '$lib/content/loaders';
import { site, sitemap, summary } from '$lib/content/site';
import { workWithPages } from '$lib/content/vault';
import { markdownPath } from '$lib/markdown';

export const prerender = true;

const link = (title: string, path: string, note?: string) =>
    `- [${title}](${site.url}${markdownPath(path)})${note ? `: ${note}` : ''}`;

/**
 * The site's map for language models, in the llmstxt.org format, pointing at each page's Markdown.
 * The About page's own Markdown, bio and contact, sits under the summary, so a reader learns who Mia
 * is without following a link.
 */
export async function GET({ fetch }) {
    const about = await fetch(markdownPath('/about'));
    if (!about.ok) throw new Error(`Could not render /about.md for llms.txt (${about.status}).`);
    // Drop the frontmatter and the "About me" heading; llms.txt's own H1 already names her.
    const bio = (await about.text()).replace(/^---\n[\s\S]*?\n---\n+# .*\n+/, '').trim();
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
        `> ${summary}`,
        bio,
        ...sections.filter(([, links]) => links.length).map(([title, links]) => `## ${title}\n\n${links.join('\n')}`),
    ].join('\n\n');
    return new Response(`${body}\n`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
