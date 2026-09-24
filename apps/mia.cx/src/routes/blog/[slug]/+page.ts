import { loadPost, postEntries } from '$lib/content/loaders';
import { SECTIONS } from '$lib/content/sections';
import type { EntryGenerator, PageLoad } from './$types';

// With the blog off there are no posts to prerender, and the Worker answers every post URL with a 404.
export const prerender = SECTIONS.blog.published;
export const entries: EntryGenerator = postEntries;
export const load: PageLoad = ({ params }) => loadPost(params.slug);
