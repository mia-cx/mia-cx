/** Route loaders, shared so pages stay presentation-only. */
import { error } from '@sveltejs/kit';
import { postBySlug, posts, render, work, workBySlug, workWithPages } from './vault';

export const workEntries = () => workWithPages.map(({ slug }) => ({ slug }));

export function loadWork(slug: string) {
    const note = workBySlug(slug);
    if (!note || !note.markdown) error(404, 'No such project');
    const index = workWithPages.indexOf(note);
    return {
        note,
        html: render(note.markdown),
        previous: workWithPages[index - 1] ?? null,
        next: workWithPages[index + 1] ?? null,
    };
}

/** Externally hosted posts have no page of their own; the index links straight out. */
export const postEntries = () => posts.filter((post) => !post.external).map(({ slug }) => ({ slug }));

export function loadPost(slug: string) {
    const post = postBySlug(slug);
    if (!post || post.external) error(404, 'No such post');
    return { post, html: render(post.markdown) };
}

export { formatDate } from './vault';
export { work };
