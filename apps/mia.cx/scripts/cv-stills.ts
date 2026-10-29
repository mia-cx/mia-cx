/**
 * Bakes the field stills the printed CV and Articles draw under their content, from the
 * /cv-stills page, in a Chromium you already have open, over the DevTools protocol:
 *
 *   pnpm build && pnpm preview
 *   pnpm cv-stills [base-url] [devtools-url]
 *
 * Start that Chromium with --remote-debugging-port=9222. A real browser draws the field with WebGPU;
 * automation browsers and headless software renderers do not. The page opens in a background tab
 * with focus emulated, so it keeps drawing without taking the window, and closes when done.
 *
 * Re-run it when a seed, a frame or the sheets' layout changes: the dimming follows the layout.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [base = 'http://localhost:4173', devtools = 'http://127.0.0.1:9222'] = process.argv.slice(2);
const out = (name: string) => fileURLToPath(new URL(`../src/lib/cv/stills/${name}.webp`, import.meta.url));
/** Output pixels per CSS pixel: an A4 sheet comes out about 1600 px wide, plenty for a soft field. */
const RESOLUTION = 2;

const { webSocketDebuggerUrl } = (await (await fetch(`${devtools}/json/version`)).json()) as {
    webSocketDebuggerUrl: string;
};
const socket = new WebSocket(webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
});

let nextId = 0;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    const waiting = pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    if (message.error) waiting.reject(new Error(message.error.message));
    else waiting.resolve(message.result);
};
function send<T = Record<string, unknown>>(method: string, params = {}, sessionId?: string): Promise<T> {
    const id = ++nextId;
    socket.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => pending.set(id, { resolve: resolve as (value: unknown) => void, reject }));
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const { targetId } = await send<{ targetId: string }>('Target.createTarget', { url: 'about:blank', background: true });
try {
    const { sessionId } = await send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
    const run = <T = Record<string, unknown>>(method: string, params = {}) => send<T>(method, params, sessionId);
    const evaluate = async <T>(expression: string) =>
        (await run<{ result: { value: T } }>('Runtime.evaluate', { expression, returnByValue: true })).result.value;
    await run('Page.enable');
    // A background tab otherwise stops drawing frames.
    await run('Emulation.setFocusEmulationEnabled', { enabled: true });
    // Transparent where the page draws nothing, so each still keeps the field's own alpha.
    await run('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    await run('Page.navigate', { url: `${base}/cv-stills` });

    const deadline = Date.now() + 60_000;
    while (
        !(await evaluate<boolean>(`(() => {
        const stills = document.querySelectorAll('canvas[data-still]');
        return stills.length > 0 && [...stills].every((canvas) => canvas.hasAttribute('data-ready'));
    })()`))
    ) {
        if (Date.now() > deadline) throw new Error('the fields never drew; is WebGPU on in this Chromium?');
        await sleep(250);
    }

    const stills = await evaluate<{ name: string; x: number; y: number; width: number; height: number; dpr: number }[]>(
        `[...document.querySelectorAll('canvas[data-still]')].map((canvas) => {
            const r = canvas.getBoundingClientRect();
            return { name: canvas.dataset.still, x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height,
                dpr: devicePixelRatio };
        })`,
    );
    for (const { name, x, y, width, height, dpr } of stills) {
        const { data } = await run<{ data: string }>('Page.captureScreenshot', {
            format: 'webp',
            quality: 90,
            captureBeyondViewport: true,
            clip: { x, y, width, height, scale: RESOLUTION / dpr },
        });
        writeFileSync(out(name), Buffer.from(data, 'base64'));
        console.log(`still: ${out(name)}`);
    }
} finally {
    await send('Target.closeTarget', { targetId });
    socket.close();
}
