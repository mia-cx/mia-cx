import { loadWork, workEntries } from '$lib/content/loaders';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = workEntries;
// A project write-up is an Article: it prints itself, not the CV.
export const load: PageLoad = ({ params }) => ({ ...loadWork(params.slug), article: true });
