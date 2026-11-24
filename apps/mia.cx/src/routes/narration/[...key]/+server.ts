import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Read from R2 per request, in every environment, `pnpm dev` included (see wrangler.jsonc).
export const prerender = false;

/**
 * A narrated page's word timings and audio: `pages/<hash>.json` and `pages/<hash>.mp3`, the hash being
 * of the text it reads (see `$lib/narration/extract`). The content behind a key never changes, so
 * found narration is cached for good. Audio answers byte ranges, so the player can seek.
 */
const SERVED = /^pages\/[0-9a-f]{64}\.(json|mp3)$/;

export const GET: RequestHandler = async ({ params, request, platform }) => {
    if (!SERVED.test(params.key)) error(404, 'No such narration');
    const bucket = platform?.env.NARRATION;
    if (!bucket) error(503, 'Narration is not configured here');
    const object = await bucket.get(params.key, { range: request.headers, onlyIf: request.headers });
    if (!object) error(404, 'No such narration');

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    headers.set('accept-ranges', 'bytes');
    if (!object.body) return new Response(null, { status: 304, headers });

    const range = object.range;
    if (!request.headers.has('range') || !range) return new Response(object.body, { headers });
    const offset = range.suffix !== undefined ? object.size - range.suffix : (range.offset ?? 0);
    const length = range.suffix ?? range.length ?? object.size - offset;
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('content-length', String(length));
    return new Response(object.body, { status: 206, headers });
};
