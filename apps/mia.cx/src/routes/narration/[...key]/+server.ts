import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Read from R2 per request, in every environment, `pnpm dev` included (see wrangler.jsonc).
export const prerender = false;

/**
 * A narrated page's manifest, `pages/<key>.json`, keyed by what the page reads (see
 * `$lib/narration/extract`), and the audio it names, `audio/<hash>.mp3`. A page narrated afresh gets new
 * audio under a new hash, so audio is cached for good, while a manifest is checked again on every use.
 * Audio answers byte ranges, so the player can seek.
 */
const SERVED = /^(?:pages\/[0-9a-f]{64}\.json|audio\/[0-9a-f]{64}\.mp3)$/;

export const GET: RequestHandler = async ({ params, request, platform }) => {
    if (!SERVED.test(params.key)) error(404, 'No such narration');
    const bucket = platform?.env.NARRATION;
    if (!bucket) error(503, 'Narration is not configured here');
    const object = await bucket.get(params.key, { range: request.headers, onlyIf: request.headers });
    if (!object) error(404, 'No such narration');

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    const audio = params.key.startsWith('audio/');
    headers.set('cache-control', audio ? 'public, max-age=31536000, immutable' : 'public, no-cache');
    headers.set('accept-ranges', 'bytes');
    // No body means a precondition failed: unchanged for a conditional GET, otherwise a failed If-Match.
    if (!object.body) {
        const revalidating = request.headers.has('if-none-match') || request.headers.has('if-modified-since');
        return new Response(null, { status: revalidating ? 304 : 412, headers });
    }

    const range = object.range;
    if (!request.headers.has('range') || !range) return new Response(object.body, { headers });
    const offset = range.suffix !== undefined ? object.size - range.suffix : (range.offset ?? 0);
    const length = range.suffix ?? range.length ?? object.size - offset;
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('content-length', String(length));
    return new Response(object.body, { status: 206, headers });
};
