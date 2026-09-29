/**
 * Renders static/og.jpg, the image link previews show for mia.cx, by cropping the 1200×630 card out
 * of the /og route (1200×630) in a Chromium you already have open, over the DevTools protocol:
 *
 *   pnpm build && pnpm preview
 *   pnpm share-card [base-url] [devtools-url]
 *   pnpm share-card --tab [devtools-url]    capture the /og tab you already have open, as it is now
 *
 * Start that Chromium with --remote-debugging-port=9222. A real browser draws the field with WebGPU
 * at full resolution; automation browsers and headless software renderers do not. The page keeps the
 * window's real size, since the field is a full-viewport canvas and a shrunken viewport changes how
 * it renders; the card sits centred on it and only the card is captured, at 1200×630. The
 * tab opens in front, since a background tab pauses the field, and closes when done.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
// --tab captures an /og tab that is already open, without reloading it, so a frame picked by eye is kept.
const current = args.includes('--tab');
const positional = args.filter((arg) => arg !== '--tab');
const base = current ? '' : (positional[0] ?? 'http://localhost:4173');
const devtools = (current ? positional[0] : positional[1]) ?? 'http://127.0.0.1:9222';
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

const open = current
    ? ((await (await fetch(`${devtools}/json/list`)).json()) as { id: string; type: string; url: string }[]).find(
          (target) => target.type === 'page' && new URL(target.url).pathname === '/og',
      )
    : undefined;
if (current && !open) throw new Error('no open tab on /og');
const { targetId } = open
    ? { targetId: open.id }
    : await send<{ targetId: string }>('Target.createTarget', { url: 'about:blank', background: false });
try {
    const { sessionId } = await send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
    const run = <T = Record<string, unknown>>(method: string, params = {}) => send<T>(method, params, sessionId);
    await run('Page.enable');
    await run('Page.bringToFront');
    if (!current) await run('Page.navigate', { url: `${base}/og` });

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
    // Time for the adaptive resolution to settle at full scale; an open tab has had it.
    if (!current) await sleep(6000);
    const { result: box } = await run<{
        result: { value: { x: number; y: number; width: number; height: number; dpr: number; fits: boolean } };
    }>('Runtime.evaluate', {
        expression: `(() => {
            const r = document.querySelector('[data-card]').getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height, dpr: devicePixelRatio,
                fits: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
        })()`,
        returnByValue: true,
    });
    if (!box.value.fits) throw new Error('the window is smaller than 1200×630; make it bigger');
    const { x, y, width, height, dpr } = box.value;
    const { data } = await run<{ data: string }>('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 88,
        // At the card's CSS size, whatever the display's own density is.
        clip: { x, y, width, height, scale: 1 / dpr },
    });
    writeFileSync(out, Buffer.from(data, 'base64'));
    console.log(`share card: ${out}`);
} finally {
    if (!current) await send('Target.closeTarget', { targetId });
    socket.close();
}
