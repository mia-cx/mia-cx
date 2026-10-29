/**
 * Bakes the field stills the printed CV and Articles draw under their content, and the CV's portrait
 * layers, from the /cv-stills page, in a Chromium you already have open, over the DevTools protocol:
 *
 *   pnpm build && pnpm preview
 *   pnpm cv-stills [base-url] [devtools-url]
 *
 * Start that Chromium with --remote-debugging-port=9222. A real browser draws the field with WebGPU;
 * automation browsers and headless software renderers do not. The page opens in a background tab
 * with focus emulated, so it keeps drawing without taking the window, and closes when done.
 *
 * Re-run it when a seed, a frame, a mask or the sheets' layout changes: the dimming follows the layout.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [base = 'http://localhost:4173', devtools = 'http://127.0.0.1:9222'] = process.argv.slice(2);
const out = (name: string) => fileURLToPath(new URL(`../src/lib/cv/stills/${name}.webp`, import.meta.url));
/** Device pixels per CSS pixel the field renders at; its effects are tuned for a 2× display. */
const RESOLUTION = 2;
/**
 * Output pixels per CSS pixel. The field is all soft gradients, so a sheet saved at 1× (794 px wide)
 * prints the same as at 2× for a seventh of the bytes, and every page that isn't an Article carries it.
 */
const OUTPUT = 1;

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
    // The field renders at the page's pixel density, and its effects work in device pixels, so the
    // density is pinned, and the width with it so the sheets lay out the same in any window: the
    // same seed and frame bake the same still anywhere.
    await run('Emulation.setDeviceMetricsOverride', {
        width: 1024,
        height: 1024,
        deviceScaleFactor: RESOLUTION,
        mobile: false,
    });
    const { errorText } = await run<{ errorText?: string }>('Page.navigate', { url: `${base}/cv-stills` });
    if (errorText) throw new Error(`could not open ${base}/cv-stills (${errorText}); is pnpm preview running?`);

    const deadline = Date.now() + 60_000;
    for (;;) {
        const { ready, failure } = await evaluate<{ ready: boolean; failure?: string }>(`(() => {
            const stills = [...document.querySelectorAll('[data-still]')];
            return {
                ready: stills.length > 0 && stills.every((still) => still.hasAttribute('data-ready')),
                failure: stills.find((still) => still.dataset.error)?.dataset.error,
            };
        })()`);
        if (failure) throw new Error(`a layer could not be baked: ${failure}`);
        if (ready) break;
        if (Date.now() > deadline) throw new Error('the fields never drew; is WebGPU on in this Chromium?');
        await sleep(250);
    }

    // A layer can ask for more pixels with data-scale: the portrait is sharp where the field is soft.
    const stills = await evaluate<
        { name: string; x: number; y: number; width: number; height: number; scale: number }[]
    >(
        `[...document.querySelectorAll('[data-still]')].map((still) => {
            const r = still.getBoundingClientRect();
            return { name: still.dataset.still, x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height,
                scale: (Number(still.dataset.scale) || ${OUTPUT}) / devicePixelRatio };
        })`,
    );
    for (const { name, x, y, width, height, scale } of stills) {
        const { data } = await run<{ data: string }>('Page.captureScreenshot', {
            format: 'webp',
            quality: 80,
            captureBeyondViewport: true,
            clip: { x, y, width, height, scale },
        });
        writeFileSync(out(name), Buffer.from(data, 'base64'));
        console.log(`still: ${out(name)}`);
    }
} finally {
    await send('Target.closeTarget', { targetId });
    socket.close();
}
