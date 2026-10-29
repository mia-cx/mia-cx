import { ROLE_KEY, resolveCV } from '$lib/cv/presets';
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
    // A failed read falls back to the default CV, like a missing preset: a shared link never breaks.
    const raw = role
        ? await platform?.env.CV_PRESETS?.get(role).catch((error: unknown) => {
              console.error(`CV preset ${role}:`, error);
              return null;
          })
        : null;
    return { cv: resolveCV(raw), theme, role } as const;
};
