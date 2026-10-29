import { digest } from '$lib/cv/pdf';
import { ROLE_KEY, readPreset, resolveCV } from '$lib/cv/presets';
import type { PageServerLoad } from './$types';

// Rendered per request by the Worker, since a role's preset lives in KV and changes without a deploy.
export const prerender = false;

/**
 * `/cv?role=<key>&theme=colour|print`: the CV for a role preset, defaulting to the plain CV, in a
 * Theme, defaulting to Print.
 */
export const load: PageServerLoad = async ({ url, platform }) => {
    const key = url.searchParams.get('role');
    const role = key && ROLE_KEY.test(key) ? key : null;
    const theme = url.searchParams.get('theme') === 'colour' ? 'colour' : 'print';
    const raw = await readPreset(platform?.env.CV_PRESETS, role);
    // Published on the page, so /cv.pdf caches a render only when it shows the preset /cv.pdf read.
    const preset = raw ? await digest(raw) : '';
    return { cv: resolveCV(raw), theme, role, preset } as const;
};
