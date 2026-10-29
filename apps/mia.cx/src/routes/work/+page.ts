import { workAppendix } from '$lib/cv/appendix';
import type { PageLoad } from './$types';

/** Printing /work gives the CV, then every listed project. */
export const load: PageLoad = () => ({ appendix: workAppendix() });
