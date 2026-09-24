import { loadPost, postEntries } from '$lib/content/loaders';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = postEntries;
export const load: PageLoad = ({ params }) => loadPost(params.slug);
