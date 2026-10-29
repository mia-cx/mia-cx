import puppeteer, { type BrowserWorker } from '@cloudflare/puppeteer';
import { error } from '@sveltejs/kit';
import { site } from '$lib/content/site';
import { ROLE_KEY, resolveCV } from '$lib/cv/presets';
import { cacheKey, digest, pdfDate, pdfFilename } from '$lib/cv/pdf';
import type { RequestHandler } from './$types';

export const prerender = false;

/** A day: one render per Theme, role and preset value per day. */
const MAX_AGE = 86_400;
/** How long a browser stays open after a render, so the next download reuses it. */
const KEEP_ALIVE = 60_000;
/** The free plan starts one new browser every 20 seconds. */
const RETRY_AFTER = 20;

/** An open browser no one is using, or a new one: back-to-back downloads would otherwise hit the launch limit. */
async function openBrowser(binding: BrowserWorker) {
    const idle = (await puppeteer.sessions(binding)).find((session) => !session.connectionId);
    if (idle) {
        try {
            return await puppeteer.connect(binding, idle.sessionId);
        } catch {
            // Another request took it first; launch our own.
        }
    }
    return puppeteer.launch(binding, { keep_alive: KEEP_ALIVE });
}

/**
 * `/cv.pdf?theme=colour|print&role=<key>`: /cv with the same query, printed by Browser Rendering to an
 * A4 PDF with backgrounds, as `MiaRiezebos_CV_YYYY-MM-DD.pdf`. Renders are cached here for the day;
 * the download itself is never cached downstream, so a preset edit or a new day always reaches it.
 */
export const GET: RequestHandler = async ({ url, platform }) => {
    const env = platform?.env;
    if (!env?.BROWSER) error(503, 'PDF rendering is not set up here.');

    const key = url.searchParams.get('role');
    const theme = url.searchParams.get('theme') === 'colour' ? 'colour' : 'print';
    const preset = (key && ROLE_KEY.test(key) && (await env.CV_PRESETS?.get(key))) || '';
    // A role without a preset is the default CV, so it renders and caches as that: made-up roles cost nothing.
    const role = preset ? key : null;
    const date = pdfDate(new Date());
    const headers = {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${pdfFilename(date)}"`,
        'cache-control': 'no-store',
    };

    const cache = (globalThis.caches as (CacheStorage & { default: Cache }) | undefined)?.default;
    const entry = cacheKey(url.origin, { date, theme, role, preset: preset && (await digest(preset)) });
    const cached = await cache?.match(entry);
    if (cached) return new Response(cached.body, { headers });

    const page = new URL('/cv', url.origin);
    page.searchParams.set('theme', theme);
    if (role) page.searchParams.set('role', role);

    let browser;
    try {
        browser = await openBrowser(env.BROWSER);
    } catch {
        return new Response('The CV is busy printing. Try again in a moment.', {
            status: 503,
            headers: { 'retry-after': String(RETRY_AFTER) },
        });
    }
    let pdf: Uint8Array<ArrayBuffer>;
    let current: boolean;
    try {
        const tab = await browser.newPage();
        const response = await tab.goto(page.href, { waitUntil: 'networkidle0' });
        if (!response?.ok()) error(502, 'The CV page did not render.');
        await tab.emulateMediaType('print');
        // /cv reads KV on its own, which may lag an edit: only a page showing the preset read here is cached.
        const title = await tab.$eval('meta[property="og:title"]', (meta) => meta.getAttribute('content'));
        current = title === `${site.name}, ${resolveCV(preset).title}`;
        // Copied onto a plain ArrayBuffer, which is what a Response body takes.
        pdf = new Uint8Array(await tab.pdf({ preferCSSPageSize: true, printBackground: true }));
        await tab.close();
    } finally {
        // Left open for the next download; it closes itself once idle.
        browser.disconnect();
    }

    if (current) {
        const stored = { ...headers, 'cache-control': `public, max-age=${MAX_AGE}` };
        await cache?.put(entry, new Response(pdf.slice(), { headers: stored }));
    }
    return new Response(pdf, { headers });
};
