import type { LayoutLoad } from './$types';

/** The Textile policies are Articles: they print themselves, not the CV. */
export const load: LayoutLoad = () => ({ article: true });
