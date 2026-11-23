// PROTOTYPE (throwaway, never merges): the narration and selection highlight block from #66.
import { loadPost } from '$lib/content/loaders';
import type { PageLoad } from './$types';

export const prerender = false;
export const load: PageLoad = () => loadPost('/work/caelestis/yet-another-overlay-mod');
