/**
 * Narrates the built site in Mia's cloned voice. Every prerendered page with a `data-narration` region
 * gets one stitched MP3 and its word timings in the mia-cx-narration R2 bucket, under a hash of the text
 * it reads, which the page's player looks up by the same hash (see `src/lib/narration/extract.ts`).
 *
 *   pnpm build && pnpm narrate               narrate what is missing
 *   pnpm narrate --dry-run                   show what it would narrate and what that costs
 *   pnpm narrate --budget 60000              allow a bigger run, such as after a voice change
 *   pnpm narrate --only /blog/crunch-time    narrate one page, to try a change on
 *
 * Each block (a paragraph, heading or list item) is generated once and kept under a hash of its text and
 * voice settings, so editing one paragraph pays for that paragraph only. Nothing is generated when a run
 * would spend more than its budget (25,000 characters by default) or more than the account has left.
 *
 * Needs ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID (ELEVENLABS_MODEL_ID defaults to eleven_v4), from the
 * environment or apps/mia.cx/.env, ffmpeg and ffprobe, and Cloudflare access to R2: wrangler's login
 * locally, CLOUDFLARE_API_TOKEN in CI.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import { parseHTML } from 'linkedom';
import {
    NARRATION_VERSION,
    narratedBlocks,
    pageKey,
    sha256,
    spokenText,
    type NarratedWord,
    type NarrationManifest,
} from '../src/lib/narration/extract';

const run = promisify(execFile);
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyArg = args.indexOf('--only');
const only = onlyArg >= 0 ? args[onlyArg + 1] : undefined;
const budgetArg = args.indexOf('--budget');
const BUDGET = budgetArg >= 0 ? Number(args[budgetArg + 1]) : 25_000;

const BUCKET = 'mia-cx-narration';
// The mia.cx Cloudflare account; wrangler's login can see several.
process.env.CLOUDFLARE_ACCOUNT_ID ??= '492214885e7a580ccc1d141dfdb4dc5f';
const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID;
const MODEL = process.env.ELEVENLABS_MODEL_ID || 'eleven_v4';
const FORMAT = 'mp3_44100_128';
/** The built site, and where generated audio is kept between runs. */
const SITE = '.svelte-kit/cloudflare';
const CACHE = '.narration';
/** Characters per request at most; a longer block is split at sentence ends. */
const MAX_CHUNK = 2500;
/** Silence between blocks, in seconds, so a paragraph ends before the next begins. */
const GAP = 0.45;
/**
 * How the voice should say words it misreads: each whole word, in any case, is read as its alias. The
 * script keeps an ElevenLabs pronunciation dictionary of exactly these, and a chunk's key includes the
 * ones it says, so changing a rule regenerates only the chunks that use it.
 */
const PRONUNCIATIONS: Record<string, string> = {
    nuphory: 'new phorie',
};

/** Part of a block, read by one request. */
interface Chunk {
    key: string;
    words: NarratedWord[];
    text: string;
    offsets: number[];
}
interface Page {
    path: string;
    key: string;
    /** Each block's chunks, in reading order. */
    blocks: Chunk[][];
}
/** What the bucket holds, kept in index.json, so a run knows what to skip without listing it. */
interface Index {
    pages: string[];
    chunks: string[];
}

const ms = (seconds: number) => Math.round(seconds * 1000) / 1000;

async function wrangler(...command: string[]) {
    return run('node_modules/.bin/wrangler', [...command, '--remote'], { maxBuffer: 1 << 26 });
}
async function download(key: string, file: string) {
    try {
        await wrangler('r2', 'object', 'get', `${BUCKET}/${key}`, '--file', file);
        return true;
    } catch {
        return false;
    }
}
const upload = (key: string, file: string, contentType: string) =>
    wrangler('r2', 'object', 'put', `${BUCKET}/${key}`, '--file', file, '--content-type', contentType);

async function* htmlFiles(dir: string): AsyncGenerator<string> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) yield* htmlFiles(path);
        else if (entry.name.endsWith('.html')) yield path;
    }
}

/** A block's words in chunks short enough for one request, split after a sentence ends. */
function chunksOf(words: NarratedWord[]): Chunk[] {
    const groups: NarratedWord[][] = [[]];
    let length = 0;
    for (const word of words) {
        const group = groups.at(-1)!;
        if (length + word.text.length > MAX_CHUNK && group.length) {
            // Back up to the last sentence end in this group, if there is one.
            const cut = group.findLastIndex((w) => /[.!?]["')\]]*$/.test(w.text)) + 1 || group.length;
            groups.push(group.splice(cut));
            length = groups.at(-1)!.reduce((sum, w) => sum + w.text.length + 1, 0);
        }
        groups.at(-1)!.push(word);
        length += word.text.length + 1;
    }
    return groups.map((group) => {
        const { text, offsets } = spokenText(group);
        const said = Object.entries(PRONUNCIATIONS).filter(([word]) => new RegExp(`\\b${word}\\b`, 'i').test(text));
        const key = sha256(
            JSON.stringify({
                v: NARRATION_VERSION,
                text,
                voice: VOICE,
                model: MODEL,
                format: FORMAT,
                // Left out when empty, so chunks without any keep the keys they had before rules existed.
                say: said.length ? Object.fromEntries(said) : undefined,
            }),
        );
        return { key, words: group, text, offsets };
    });
}

async function readPages(): Promise<Page[]> {
    const pages: Page[] = [];
    for await (const file of htmlFiles(SITE)) {
        const { document } = parseHTML(await readFile(file, 'utf8'));
        const region = document.querySelector('[data-narration]');
        if (!region) continue;
        const blocks = narratedBlocks(region);
        if (!blocks.length) continue;
        pages.push({
            path: '/' + relative(SITE, file).replace(/(index)?\.html$/, ''),
            key: pageKey(blocks),
            blocks: blocks.map((block) => chunksOf(block.words)),
        });
    }
    return pages;
}

interface DictionaryLocator {
    pronunciation_dictionary_id: string;
    version_id: string;
}

/** ElevenLabs' JSON API, failing loudly. */
async function eleven<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`https://api.elevenlabs.io/v1/${path}`, {
        ...init,
        headers: { 'xi-api-key': KEY!, 'content-type': 'application/json' },
    });
    if (!response.ok) throw new Error(`ElevenLabs answered ${response.status} to ${path}: ${await response.text()}`);
    return response.json() as Promise<T>;
}

/** The pronunciation dictionary holding exactly PRONUNCIATIONS, named by their hash and made on first use. */
async function findOrMakeDictionary(): Promise<DictionaryLocator> {
    const rules = Object.entries(PRONUNCIATIONS).map(([word, alias]) => ({
        type: 'alias',
        string_to_replace: word,
        alias,
        case_sensitive: false,
        word_boundaries: true,
    }));
    const name = `mia.cx ${sha256(JSON.stringify(rules)).slice(0, 12)}`;
    const { pronunciation_dictionaries } = await eleven<{
        pronunciation_dictionaries: { id: string; latest_version_id: string; name: string }[];
    }>('pronunciation-dictionaries?page_size=100');
    const found = pronunciation_dictionaries.find((d) => d.name === name);
    if (found) return { pronunciation_dictionary_id: found.id, version_id: found.latest_version_id };
    const made = await eleven<{ id: string; version_id: string }>('pronunciation-dictionaries/add-from-rules', {
        method: 'POST',
        body: JSON.stringify({ name, rules }),
    });
    return { pronunciation_dictionary_id: made.id, version_id: made.version_id };
}

/** Looked up once per run, and only by a run that generates something. */
let dictionary: Promise<DictionaryLocator> | undefined;

/** Generates one chunk: its audio, and each word's start and end within it. */
async function generate(chunk: Chunk) {
    dictionary ??= findOrMakeDictionary();
    const { audio_base64, alignment } = await eleven<{
        audio_base64: string;
        alignment: {
            characters: string[];
            character_start_times_seconds: number[];
            character_end_times_seconds: number[];
        };
    }>(`text-to-speech/${VOICE}/with-timestamps?output_format=${FORMAT}`, {
        method: 'POST',
        body: JSON.stringify({
            text: chunk.text,
            model_id: MODEL,
            pronunciation_dictionary_locators: [await dictionary],
        }),
    });
    // Word timings index into the text as sent; an alignment of anything else would misplace every word.
    if (alignment.characters.join('') !== chunk.text)
        throw new Error(`ElevenLabs aligned different text than it was sent for chunk ${chunk.key}.`);
    const words = chunk.words.flatMap((word, i) => {
        const first = chunk.offsets[i];
        const last = first + word.text.length - 1;
        return [ms(alignment.character_start_times_seconds[first]), ms(alignment.character_end_times_seconds[last])];
    });
    await writeFile(join(CACHE, `${chunk.key}.mp3`), Buffer.from(audio_base64, 'base64'));
    await writeFile(join(CACHE, `${chunk.key}.json`), JSON.stringify({ words }));
}

/** A chunk's files in the local cache, fetched from the bucket when this machine hasn't made them. */
async function cached(chunk: Chunk) {
    for (const ext of ['mp3', 'json']) {
        const file = join(CACHE, `${chunk.key}.${ext}`);
        if (!existsSync(file) && !(await download(`chunks/${chunk.key}.${ext}`, file)))
            throw new Error(`chunks/${chunk.key}.${ext} is in index.json but not in the bucket`);
    }
    return JSON.parse(await readFile(join(CACHE, `${chunk.key}.json`), 'utf8')) as { words: number[] };
}

/** Decoded to PCM, an audio file's length is exact; MP3 frame padding would drift the word timings. */
async function decoded(mp3: string) {
    const wav = mp3.replace(/\.mp3$/, '.wav');
    await run('ffmpeg', ['-v', 'error', '-y', '-i', mp3, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', wav]);
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]);
    return { wav, duration: Number(stdout.trim()) };
}

/** Stitches a page's chunks into one MP3 with a pause between blocks, and shifts every word's timing to match. */
async function stitch(page: Page): Promise<{ mp3: string; manifest: NarrationManifest }> {
    const work = join(CACHE, page.key);
    await mkdir(work, { recursive: true });
    const gap = join(work, 'gap.wav');
    await run('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'anullsrc=r=44100:cl=mono',
        '-t',
        String(GAP),
        '-c:a',
        'pcm_s16le',
        gap,
    ]);
    const parts: string[] = [];
    const words: number[] = [];
    let at = 0;
    for (const [b, block] of page.blocks.entries()) {
        if (b > 0) {
            parts.push(gap);
            at += GAP;
        }
        for (const chunk of block) {
            const timings = await cached(chunk);
            words.push(...timings.words.map((t) => ms(t + at)));
            const { wav, duration } = await decoded(join(CACHE, `${chunk.key}.mp3`));
            parts.push(wav);
            at += duration;
        }
    }
    const list = join(work, 'parts.txt');
    await writeFile(list, parts.map((part) => `file '${relative(work, part)}'`).join('\n'));
    const mp3 = join(work, 'page.mp3');
    await run('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        list,
        '-ac',
        '1',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '128k',
        mp3,
    ]);
    return { mp3, manifest: { version: NARRATION_VERSION, duration: ms(at), words, voice: VOICE!, model: MODEL } };
}

async function main() {
    if (!KEY || !VOICE)
        throw new Error('Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID, in the environment or apps/mia.cx/.env.');
    if (!existsSync(SITE)) throw new Error(`No built site at ${SITE}: run pnpm build first.`);
    await mkdir(CACHE, { recursive: true });

    const pages = await readPages();
    const indexFile = join(CACHE, 'index.json');
    const index: Index = (await download('index.json', indexFile))
        ? JSON.parse(await readFile(indexFile, 'utf8'))
        : { pages: [], chunks: [] };
    const pending = pages.filter(
        (page, i) =>
            !index.pages.includes(page.key) &&
            pages.findIndex((p) => p.key === page.key) === i &&
            (!only || page.path === only),
    );
    const missing = [
        ...new Map(
            pending
                .flatMap((page) => page.blocks.flat())
                .filter((chunk) => !index.chunks.includes(chunk.key))
                .map((chunk) => [chunk.key, chunk]),
        ).values(),
    ];
    const characters = missing.reduce((sum, chunk) => sum + chunk.text.length, 0);

    console.log(`${pages.length} narrated pages; ${pending.length} to narrate:`);
    for (const page of pending) console.log(`  ${page.path}`);
    console.log(`${missing.length} blocks to generate: ${characters} characters (budget ${BUDGET}).`);
    if (dryRun || !pending.length) return;

    if (characters > BUDGET)
        throw new Error(
            `This run needs ${characters} characters, over its budget of ${BUDGET}. Rerun with --budget ${characters} to allow it.`,
        );
    if (characters) {
        const { character_count, character_limit } = await eleven<Record<string, number>>('user/subscription');
        if (characters > character_limit - character_count)
            throw new Error(
                `This run needs ${characters} characters; the account has ${character_limit - character_count} left.`,
            );
    }

    const saveIndex = async () => {
        await writeFile(indexFile, JSON.stringify(index));
        await upload('index.json', indexFile, 'application/json');
    };
    for (const [i, chunk] of missing.entries()) {
        await generate(chunk);
        await upload(`chunks/${chunk.key}.mp3`, join(CACHE, `${chunk.key}.mp3`), 'audio/mpeg');
        await upload(`chunks/${chunk.key}.json`, join(CACHE, `${chunk.key}.json`), 'application/json');
        index.chunks.push(chunk.key);
        console.log(`  generated ${i + 1}/${missing.length}`);
        if ((i + 1) % 10 === 0) await saveIndex();
    }
    await saveIndex();

    for (const page of pending) {
        const { mp3, manifest } = await stitch(page);
        const json = join(CACHE, page.key, 'page.json');
        await writeFile(json, JSON.stringify(manifest));
        await upload(`pages/${page.key}.mp3`, mp3, 'audio/mpeg');
        await upload(`pages/${page.key}.json`, json, 'application/json');
        index.pages.push(page.key);
        await saveIndex();
        const { size } = await stat(mp3);
        await rm(join(CACHE, page.key), { recursive: true });
        console.log(`  narrated ${page.path}: ${Math.round(manifest.duration)} s, ${Math.round(size / 1024)} KiB`);
    }
}

await main();
