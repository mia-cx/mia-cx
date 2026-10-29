import puppeteer from '@cloudflare/puppeteer';
import { error } from '@sveltejs/kit';
import { ROLE_KEY } from '$lib/cv/presets';
import { cacheKey, digest, pdfDate, pdfFilename } from '$lib/cv/pdf';
import type { RequestHandler } from './$types';

export const prerender = false;

/** A day: one render per Theme, role and preset value per day. */
const MAX_AGE = 86_400;

/**
 * `/cv.pdf?theme=colour|print&role=<key>`: /cv with the same query, printed by Browser Rendering to an
 * A4 PDF with backgrounds, as `MiaRiezebos_CV_YYYY-MM-DD.pdf`.
 */
export const GET: RequestHandler = async ({ url, platform }) => {
    const env = platform?.env;
    if (!env?.BROWSER) error(503, 'PDF rendering is not set up here.');

    const key = url.searchParams.get('role');
    const role = key && ROLE_KEY.test(key) ? key : null;
    const theme = url.searchParams.get('theme') === 'colour' ? 'colour' : 'print';
    const preset = (role && (await env.CV_PRESETS?.get(role))) || '';
    const date = pdfDate(new Date());
    const filename = pdfFilename(date);

    const cache = (globalThis.caches as (CacheStorage & { default: Cache }) | undefined)?.default;
    const entry = cacheKey(url.origin, { date, theme, role, preset: preset && (await digest(preset)) });
    const cached = await cache?.match(entry);
    if (cached) return cached;

    const page = new URL('/cv', url.origin);
    page.searchParams.set('theme', theme);
    if (role) page.searchParams.set('role', role);

    const browser = await puppeteer.launch(env.BROWSER);
    let pdf: Uint8Array<ArrayBuffer>;
    try {
        const tab = await browser.newPage();
        await tab.goto(page.href, { waitUntil: 'networkidle0' });
        await tab.emulateMediaType('print');
        // Copied onto a plain ArrayBuffer, which is what a Response body takes.
        pdf = new Uint8Array(await tab.pdf({ preferCSSPageSize: true, printBackground: true }));
    } finally {
        await browser.close();
    }

    const response = new Response(pdf, {
        headers: {
            'content-type': 'application/pdf',
            'content-disposition': `attachment; filename="${filename}"`,
            'cache-control': `public, max-age=${MAX_AGE}`,
        },
    });
    await cache?.put(entry, response.clone());
    return response;
};
