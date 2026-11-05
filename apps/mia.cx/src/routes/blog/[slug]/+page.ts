import { loadPost, postEntries } from '$lib/content/loaders';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = postEntries;
// A post is an Article: it prints itself, not the CV.
export const load: PageLoad = ({ params }) => ({ ...loadPost(params.slug), article: true });
