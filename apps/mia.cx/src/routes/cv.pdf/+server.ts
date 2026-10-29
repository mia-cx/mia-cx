import puppeteer, { type Browser } from '@cloudflare/puppeteer';
import { error } from '@sveltejs/kit';
import { readPreset } from '$lib/cv/presets';
import { cacheKey, digest, pdfDate, pdfFilename } from '$lib/cv/pdf';
import type { Theme } from '$lib/cv/Sheet.svelte';
import type { RequestHandler } from './$types';

export const prerender = false;

/** A day: one render per Theme, role and preset value per day. */
const MAX_AGE = 86_400;
/** The free plan starts one new browser every 20 seconds. */
const RETRY_AFTER = 20;
/** What Browser Rendering says once the day's browser time is spent. */
const OUT_OF_TIME = /time limit exceeded/i;
const THEMES: Theme[] = ['colour', 'print'];
/**
 * How long the other Theme gets after the response. Cloudflare cancels `waitUntil` work after 30
 * seconds; this leaves time to close the browser, which would otherwise bill until it idles out.
 */
const BACKGROUND_DEADLINE = 25_000;

/**
 * `/cv.pdf?theme=colour|print&role=<key>`: /cv with the same query, printed by Browser Rendering to an
 * A4 PDF with backgrounds, as `MiaRiezebos_CV_YYYY-MM-DD.pdf`. Renders are cached here for the day;
 * the download itself is never cached downstream, so a preset edit or a new day always reaches it.
 * The browser prints the other Theme too before it closes, so the second button is a cache hit.
 */
export const GET: RequestHandler = async ({ url, platform }) => {
    const binding = platform?.env.BROWSER;
    if (!platform || !binding) error(503, 'PDF rendering is not set up here.');
    const { env, ctx } = platform;

    const key = url.searchParams.get('role');
    const theme: Theme = url.searchParams.get('theme') === 'colour' ? 'colour' : 'print';
    const preset = (await readPreset(env.CV_PRESETS, key)) || '';
    // A role without a preset is the default CV, so it renders and caches as that: made-up roles cost nothing.
    const role = preset ? key : null;
    const presetDigest = preset && (await digest(preset));
    const date = pdfDate(new Date());
    const headers = {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${pdfFilename(date)}"`,
        'cache-control': 'no-store',
    };

    const cache = (globalThis.caches as (CacheStorage & { default: Cache }) | undefined)?.default;
    const entry = (theme: Theme) => cacheKey(url.origin, { date, theme, role, preset: presetDigest });
    const cached = await cache?.match(entry(theme));
    if (cached) return new Response(cached.body, { headers });

    let browser: Browser;
    try {
        browser = await puppeteer.launch(binding);
    } catch (cause) {
        if (OUT_OF_TIME.test(String(cause))) {
            return new Response('PDF downloads are paused until tomorrow. Print the CV from mia.cx/cv instead.', {
                status: 503,
            });
        }
        return new Response('The CV is busy printing. Try again in a moment.', {
            status: 503,
            headers: { 'retry-after': String(RETRY_AFTER) },
        });
    }

    /** Prints one Theme, caching it only when /cv showed the preset read here: KV may lag an edit. */
    async function render(theme: Theme) {
        const page = new URL('/cv', url.origin);
        page.searchParams.set('theme', theme);
        if (role) page.searchParams.set('role', role);
        const tab = await browser.newPage();
        try {
            const response = await tab.goto(page.href, { waitUntil: 'networkidle0' });
            if (!response?.ok()) error(502, 'The CV page did not render.');
            await tab.emulateMediaType('print');
            const shown = await tab.$eval('meta[name="cv-preset"]', (meta) => meta.getAttribute('content'));
            // Copied onto a plain ArrayBuffer, which is what a Response body takes.
            const pdf = new Uint8Array(await tab.pdf({ preferCSSPageSize: true, printBackground: true }));
            if (shown === presetDigest) {
                const stored = { ...headers, 'cache-control': `public, max-age=${MAX_AGE}` };
                await cache?.put(entry(theme), new Response(pdf.slice(), { headers: stored }));
            }
            return pdf;
        } finally {
            await tab.close();
        }
    }

    const other = THEMES.find((each) => each !== theme)!;
    const printOther = async () => {
        if (!(await cache?.match(entry(other)))) await render(other);
    };
    // Everything the browser does is held by waitUntil, so it still closes if the visitor leaves mid-render.
    const first = render(theme);
    const rest = first.then(() => {
        const printed = printOther().catch((cause: unknown) => console.error(`/cv.pdf ${other}:`, cause));
        const deadline = new Promise((resolve) => setTimeout(resolve, BACKGROUND_DEADLINE));
        return Promise.race([printed, deadline]);
    });
    // A failed first render is thrown to the visitor below, so here it only has to close the browser.
    ctx.waitUntil(rest.catch(() => {}).finally(() => browser.close()));
    return new Response(await first, { headers });
};
