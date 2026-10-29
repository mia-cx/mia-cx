import { beforeEach, describe, expect, test, vi } from 'vitest';
import { digest } from '$lib/cv/pdf';

/** A stand-in for Browser Rendering: records what it was asked to open and prints a fixed PDF. */
const browser = vi.hoisted(() => {
    const state = {
        opened: [] as string[],
        status: 200,
        /** The preset digest the printed /cv shows. */
        shown: '',
        launches: 0,
        tabsOpen: 0,
        browsersOpen: 0,
        launchError: undefined as string | undefined,
    };
    const instance = () => ({
        newPage: async () => {
            state.tabsOpen++;
            return {
                goto: async (href: string) => {
                    state.opened.push(href);
                    return { ok: () => state.status < 400 };
                },
                emulateMediaType: async () => {},
                $eval: async () => state.shown,
                pdf: async () => new Uint8Array([37, 80, 68, 70]),
                close: async () => void state.tabsOpen--,
            };
        },
        close: async () => void state.browsersOpen--,
    });
    return {
        state,
        module: {
            launch: async () => {
                if (state.launchError) throw new Error(state.launchError);
                state.launches++;
                state.browsersOpen++;
                return instance();
            },
        },
    };
});
vi.mock('@cloudflare/puppeteer', () => ({ default: browser.module }));

const { GET } = await import('./+server');

const store = new Map<string, Response>();
const presets: Record<string, string> = { 'support-lead': JSON.stringify({ title: 'Support Lead' }) };
let background: Promise<unknown>[] = [];
/** A download, with the work it leaves running finished too. */
async function download(query: string) {
    const response = GET({
        url: new URL(`https://mia.cx/cv.pdf${query}`),
        platform: {
            env: {
                BROWSER: {},
                CV_PRESETS: { get: async (key: string) => presets[key] ?? null },
            },
            ctx: { waitUntil: (promise: Promise<unknown>) => void background.push(promise) },
        },
    } as never);
    await Promise.allSettled([response, ...background]);
    await Promise.all(background);
    return response;
}

beforeEach(() => {
    store.clear();
    background = [];
    Object.assign(browser.state, {
        opened: [],
        status: 200,
        shown: '',
        launches: 0,
        tabsOpen: 0,
        browsersOpen: 0,
        launchError: undefined,
    });
    vi.stubGlobal('caches', {
        default: {
            match: async (request: Request) => store.get(request.url)?.clone(),
            put: async (request: Request, response: Response) => void store.set(request.url, response),
        },
    });
});

describe('/cv.pdf', () => {
    test('prints /cv for the Theme and role, as a dated download no one downstream keeps', async () => {
        browser.state.shown = await digest(presets['support-lead']);
        const response = await download('?theme=colour&role=support-lead');
        expect(browser.state.opened[0]).toBe('https://mia.cx/cv?theme=colour&role=support-lead');
        expect(response.headers.get('content-disposition')).toMatch(
            /^attachment; filename="MiaRiezebos_CV_\d{4}-\d\d-\d\d\.pdf"$/,
        );
        expect(response.headers.get('cache-control')).toBe('no-store');
    });

    test('prints both Themes with one browser, then serves the day from the cache', async () => {
        await download('?theme=colour');
        await download('?theme=print');
        await download('?theme=colour');
        expect(browser.state.opened).toEqual(['https://mia.cx/cv?theme=colour', 'https://mia.cx/cv?theme=print']);
        expect(browser.state).toMatchObject({ launches: 1, browsersOpen: 0, tabsOpen: 0 });
    });

    test('treats a role without a preset as the default CV, so made-up roles share one render', async () => {
        await download('?theme=print&role=astronaut');
        await download('?theme=print&role=pilot');
        expect(browser.state.launches).toBe(1);
        expect(browser.state.opened[0]).toBe('https://mia.cx/cv?theme=print');
    });

    test('does not cache a page showing another preset value than the one it read', async () => {
        browser.state.shown = 'an older value';
        await download('?theme=print&role=support-lead');
        await download('?theme=print&role=support-lead');
        expect(browser.state.launches).toBe(2);
    });

    test('fails instead of printing an error page, and closes what it opened', async () => {
        browser.state.status = 500;
        await expect(download('?theme=print')).rejects.toMatchObject({ status: 502 });
        expect(store.size).toBe(0);
        expect(browser.state).toMatchObject({ browsersOpen: 0, tabsOpen: 0 });
    });

    test('asks to retry when no browser can be started yet', async () => {
        browser.state.launchError = 'Unable to create new browser: code: 429: message: Rate limit exceeded';
        const response = await download('?theme=print');
        expect(response.status).toBe(503);
        expect(response.headers.get('retry-after')).toBe('20');
    });

    test('does not ask to retry once the day’s browser time is spent', async () => {
        browser.state.launchError =
            'Unable to create new browser: code: 429: message: Browser time limit exceeded for today';
        const response = await download('?theme=print');
        expect(response.status).toBe(503);
        expect(response.headers.get('retry-after')).toBeNull();
    });
});
