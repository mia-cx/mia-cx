import { beforeEach, describe, expect, test, vi } from 'vitest';

/** A stand-in for Browser Rendering: records what it was asked to open and prints a fixed PDF. */
const browser = vi.hoisted(() => {
    const state = {
        opened: [] as string[],
        status: 200,
        title: 'Mia Riezebos, Product Engineer & Founder',
        launches: 0,
        idle: [] as { sessionId: string; connectionId?: string }[],
        launchFails: false,
    };
    const instance = () => ({
        newPage: async () => ({
            goto: async (href: string) => {
                state.opened.push(href);
                return { ok: () => state.status < 400 };
            },
            emulateMediaType: async () => {},
            $eval: async () => state.title,
            pdf: async () => new Uint8Array([37, 80, 68, 70]),
            close: async () => {},
        }),
        disconnect: () => {},
    });
    return {
        state,
        module: {
            sessions: async () => state.idle,
            connect: async () => instance(),
            launch: async () => {
                if (state.launchFails) throw new Error('Rate limit exceeded');
                state.launches++;
                return instance();
            },
        },
    };
});
vi.mock('@cloudflare/puppeteer', () => ({ default: browser.module }));

const { GET } = await import('./+server');

const store = new Map<string, Response>();
const presets: Record<string, string> = { 'support-lead': JSON.stringify({ title: 'Support Lead' }) };
const download = (query: string) =>
    GET({
        url: new URL(`https://mia.cx/cv.pdf${query}`),
        platform: {
            env: {
                BROWSER: {},
                CV_PRESETS: { get: async (key: string) => presets[key] ?? null },
            },
        },
    } as never);

beforeEach(() => {
    store.clear();
    Object.assign(browser.state, {
        opened: [],
        status: 200,
        title: 'Mia Riezebos, Product Engineer & Founder',
        launches: 0,
        idle: [],
        launchFails: false,
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
        browser.state.title = 'Mia Riezebos, Support Lead';
        const response = await download('?theme=colour&role=support-lead');
        expect(browser.state.opened).toEqual(['https://mia.cx/cv?theme=colour&role=support-lead']);
        expect(response.headers.get('content-disposition')).toMatch(
            /^attachment; filename="MiaRiezebos_CV_\d{4}-\d\d-\d\d\.pdf"$/,
        );
        expect(response.headers.get('cache-control')).toBe('no-store');
    });

    test('renders a day once, then serves it from the cache', async () => {
        await download('?theme=print');
        await download('?theme=print');
        expect(browser.state.opened).toHaveLength(1);
    });

    test('treats a role without a preset as the default CV, so made-up roles share one render', async () => {
        await download('?theme=print&role=astronaut');
        await download('?theme=print&role=pilot');
        expect(browser.state.opened).toEqual(['https://mia.cx/cv?theme=print']);
    });

    test('does not cache a page showing another preset than the one it read', async () => {
        browser.state.title = 'Mia Riezebos, Product Engineer & Founder';
        await download('?theme=print&role=support-lead');
        await download('?theme=print&role=support-lead');
        expect(browser.state.opened).toHaveLength(2);
    });

    test('fails instead of printing an error page', async () => {
        browser.state.status = 500;
        await expect(download('?theme=print')).rejects.toMatchObject({ status: 502 });
        expect(store.size).toBe(0);
    });

    test('reuses an idle browser rather than launching another', async () => {
        browser.state.idle = [{ sessionId: 'open' }];
        await download('?theme=print');
        expect(browser.state.launches).toBe(0);
    });

    test('asks to retry when no browser can be started', async () => {
        browser.state.launchFails = true;
        const response = await download('?theme=print');
        expect(response.status).toBe(503);
        expect(response.headers.get('retry-after')).toBe('20');
    });
});
