/** Route loaders, shared so pages stay presentation-only. */
import { error } from '@sveltejs/kit';
import { mentionsOf, postBySlug, posts, render, work, workBySlug, workWithPages } from './vault';

export const workEntries = () => workWithPages.map(({ slug }) => ({ slug }));

export function loadWork(slug: string) {
    const note = workBySlug(slug);
    if (!note?.hasPage) error(404, 'No such project');
    const index = workWithPages.indexOf(note);
    return {
        note,
        html: render(note.entry.markdown),
        mentions: mentionsOf(note.entry),
        previous: workWithPages[index - 1] ?? null,
        next: workWithPages[index + 1] ?? null,
    };
}

/** Posts with pages: never the ones hosted elsewhere. */
export const publishedPosts = posts.filter((post) => !post.external);

export const postEntries = () => publishedPosts.map(({ slug }) => ({ slug }));

export function loadPost(slug: string) {
    const post = postBySlug(slug);
    if (!post || !publishedPosts.includes(post)) error(404, 'No such post');
    return { post, html: render(post.entry.markdown), mentions: mentionsOf(post.entry) };
}

export { formatDate } from './vault';
export { work };
