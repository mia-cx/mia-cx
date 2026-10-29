import { blogAppendix } from '$lib/cv/appendix';
import type { PageLoad } from './$types';

/** Printing /blog gives the CV, then every post. */
export const load: PageLoad = () => ({ appendix: blogAppendix() });
