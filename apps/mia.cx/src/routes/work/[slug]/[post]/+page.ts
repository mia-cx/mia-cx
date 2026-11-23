import { loadPost, projectPostEntries } from '$lib/content/loaders';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = projectPostEntries;
// A project post is an Article like any other post: it prints itself, not the CV.
export const load: PageLoad = ({ params }) => ({
    ...loadPost(`/work/${params.slug}/${params.post}`),
    article: true,
});
