/**
 * Renders static/og.jpg, the image link previews show for mia.cx, by screenshotting the /og route
 * at 1200×630 (2× pixel density) in a Chromium you already have open, over the DevTools protocol:
 *
 *   pnpm build && pnpm preview
 *   pnpm share-card [base-url] [devtools-url]
 *
 * Start that Chromium with --remote-debugging-port=9222. A real browser draws the field with WebGPU
 * at full resolution; automation browsers and headless software renderers do not. The tab opens in
 * front, since a background tab pauses the field, and closes when done.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? 'http://localhost:4173';
const devtools = process.argv[3] ?? 'http://127.0.0.1:9222';
const out = fileURLToPath(new URL('../static/og.jpg', import.meta.url));

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

const { targetId } = await send<{ targetId: string }>('Target.createTarget', { url: 'about:blank', background: false });
try {
    const { sessionId } = await send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
    const run = <T = Record<string, unknown>>(method: string, params = {}) => send<T>(method, params, sessionId);
    await run('Page.enable');
    await run('Page.bringToFront');
    await run('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 2, mobile: false });
    await run('Page.navigate', { url: `${base}/og` });

    // Ready once the field has drawn its first frame and the entrance has finished.
    const deadline = Date.now() + 60_000;
    for (;;) {
        const { result } = await run<{ result: { value: boolean } }>('Runtime.evaluate', {
            expression: `!!document.querySelector('canvas.ready') && !document.documentElement.dataset.boot`,
            returnByValue: true,
        });
        if (result.value) break;
        if (Date.now() > deadline) throw new Error('the field never drew; is the tab visible and WebGPU on?');
        await sleep(250);
    }
    // Time for the adaptive resolution to settle at full scale.
    await sleep(6000);
    const { data } = await run<{ data: string }>('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    writeFileSync(out, Buffer.from(data, 'base64'));
    console.log(`share card: ${out}`);
} finally {
    await send('Target.closeTarget', { targetId });
    socket.close();
}
