import { loadWork, workEntries } from '$lib/content/loaders';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = workEntries;
export const load: PageLoad = ({ params }) => loadWork(params.slug);
