/** Route loaders, shared so pages stay presentation-only. */
import { error } from '@sveltejs/kit';
import { SECTIONS } from './sections';
import { mentionsOf, postBySlug, posts, render, work, workBySlug, workWithPages } from './vault';

export const workEntries = () => workWithPages.map(({ slug }) => ({ slug }));

export function loadWork(slug: string) {
    const note = workBySlug(slug);
    if (!note || !note.markdown) error(404, 'No such project');
    const index = workWithPages.indexOf(note);
    return {
        note,
        html: render(note.markdown),
        mentions: mentionsOf(note.entry),
        previous: workWithPages[index - 1] ?? null,
        next: workWithPages[index + 1] ?? null,
    };
}

/** Posts with pages: none while the blog is off, and never the ones hosted elsewhere. */
export const publishedPosts = SECTIONS.blog.published ? posts.filter((post) => !post.external) : [];

export const postEntries = () => publishedPosts.map(({ slug }) => ({ slug }));

export function loadPost(slug: string) {
    const post = postBySlug(slug);
    // The Worker would otherwise render an unpublished post on request.
    if (!post || !publishedPosts.includes(post)) error(404, 'No such post');
    return { post, html: render(post.markdown), mentions: mentionsOf(post.entry) };
}

export { formatDate } from './vault';
export { work };
