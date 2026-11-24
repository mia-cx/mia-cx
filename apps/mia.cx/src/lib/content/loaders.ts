/** Route loaders, shared so pages stay presentation-only. */
import { error } from '@sveltejs/kit';
import { mentionsOf, postAt, posts, render, work, workBySlug, workWithPages } from './vault';

export const workEntries = () => workWithPages.map(({ slug }) => ({ slug }));

export function loadWork(slug: string) {
    const note = workBySlug(slug);
    if (!note?.hasPage) error(404, 'No such project');
    const index = workWithPages.indexOf(note);
    return {
        note,
        html: render(note.entry.markdown).html,
        // The list under the body needs no post bodies.
        posts: note.posts.map(({ title, summary, date, href, external }) => ({ title, summary, date, href, external })),
        // Its own posts are listed already, whether or not they link back.
        mentions: mentionsOf(note.entry).filter((entry) => !note.posts.some((post) => post.entry === entry)),
        previous: workWithPages[index - 1] ?? null,
        next: workWithPages[index + 1] ?? null,
    };
}

/** Posts with pages: never the ones hosted elsewhere. */
export const publishedPosts = posts.filter((post) => !post.external);

/** The last segment of each blog post's path, for `/blog/[slug]`. */
export const postEntries = () =>
    publishedPosts.filter(({ project }) => !project).map(({ entry }) => ({ slug: entry.path.slice('/blog/'.length) }));

/** Each project post's project and name, for `/work/[slug]/[post]`. */
export const projectPostEntries = () =>
    publishedPosts
        .filter(({ project }) => project)
        .map(({ entry }) => {
            const [, , slug, post] = entry.path.split('/');
            return { slug, post };
        });

/** The post with a page at `path`, from /blog or a project folder alike. */
export function loadPost(path: string) {
    const post = postAt(path);
    if (!post) error(404, 'No such post');
    return { post, ...render(post.entry.markdown), mentions: mentionsOf(post.entry) };
}

export { formatDate } from './vault';
export { work };
