// PROTOTYPE (throwaway, never merges): the narration and selection highlight block from #66.
import { loadPost } from '$lib/content/loaders';
import type { PageLoad } from './$types';

export const prerender = false;
// The knobs live in localStorage, so render on the client only.
export const ssr = false;
export const load: PageLoad = () => loadPost('/work/caelestis/yet-another-overlay-mod');
