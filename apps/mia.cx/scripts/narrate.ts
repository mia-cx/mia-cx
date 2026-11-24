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
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import { parseHTML } from 'linkedom';
import {
    NARRATION_VERSION,
    narratedBlocks,
    pageKey,
    PRONUNCIATIONS,
    pronunciationsIn,
    sha256,
    spokenText,
    type NarratedBlock,
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
if (!Number.isSafeInteger(BUDGET) || BUDGET < 0)
    throw new Error(`--budget takes a whole number of characters, not "${args[budgetArg + 1]}".`);

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
/** Characters per request at most; a longer section is split between blocks, a longer block at sentence ends. */
const MAX_CHUNK = 2500;
/** Silence between requests, in seconds, so one section ends before the next begins. */
const GAP = 0.45;
/** Text that already ends a sentence; any other block gets a full stop when read, so the voice pauses. */
const SENTENCE_END = /[.!?:;…]["'”’)\]]*$/;

/** A section of a page, or part of a long one, read by one request: blocks separated by blank lines. */
interface Chunk {
    key: string;
    words: NarratedWord[];
    text: string;
    offsets: number[];
}
interface Page {
    path: string;
    key: string;
    /** In reading order. */
    chunks: Chunk[];
}
/**
 * What the bucket holds, kept in index.json, so a run knows what to skip without listing it: each
 * page's key and the sections it was stitched from, so new sections, as from a new voice, re-stitch it.
 */
interface Index {
    pages: Record<string, string[]>;
    chunks: string[];
}
/** ElevenLabs' timing of every character of a section's text, in seconds, as stored. */
interface Alignment {
    starts: number[];
    ends: number[];
}

const ms = (seconds: number) => Math.round(seconds * 1000) / 1000;

async function wrangler(...command: string[]) {
    return run('node_modules/.bin/wrangler', [...command, '--remote'], { maxBuffer: 1 << 26 });
}
/** Fetches an object, or reports it absent. Any other failure throws, so it never passes for an empty bucket. */
async function download(key: string, file: string) {
    try {
        await wrangler('r2', 'object', 'get', `${BUCKET}/${key}`, '--file', file);
        return true;
    } catch (error) {
        const { stdout = '', stderr = '' } = error as { stdout?: string; stderr?: string };
        if (`${stdout}${stderr}`.includes('The specified key does not exist')) return false;
        throw error;
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

/** A block's words in parts short enough for one request, split after a sentence ends. */
function partsOf(words: NarratedWord[]): NarratedWord[][] {
    const parts: NarratedWord[][] = [[]];
    let length = 0;
    for (const word of words) {
        const part = parts.at(-1)!;
        if (length + word.text.length > MAX_CHUNK && part.length) {
            // Back up to the last sentence end in this part, if there is one.
            const cut = part.findLastIndex((w) => SENTENCE_END.test(w.text)) + 1 || part.length;
            parts.push(part.splice(cut));
            length = parts.at(-1)!.reduce((sum, w) => sum + w.text.length + 1, 0);
        }
        parts.at(-1)!.push(word);
        length += word.text.length + 1;
    }
    return parts;
}

/** Blocks read as one text, a blank line between them, and where each word starts in it. */
function chunkOf(blocks: NarratedWord[][]): Chunk {
    let text = '';
    const offsets: number[] = [];
    for (const words of blocks) {
        if (text) text += '\n\n';
        const spoken = spokenText(words);
        offsets.push(...spoken.offsets.map((offset) => offset + text.length));
        text += SENTENCE_END.test(spoken.text) ? spoken.text : `${spoken.text}.`;
    }
    const key = sha256(
        JSON.stringify({
            v: NARRATION_VERSION,
            text,
            voice: VOICE,
            model: MODEL,
            format: FORMAT,
            // The pronunciations it uses, so changing a rule regenerates only the chunks that say it.
            say: pronunciationsIn(text),
        }),
    );
    return { key, words: blocks.flat(), text, offsets };
}

/**
 * A page's chunks: one per section, a heading and the blocks under it, so the voice reads whole
 * passages. A section too long for one request is split between blocks.
 */
function chunksOf(blocks: NarratedBlock[]): Chunk[] {
    const chunks: NarratedWord[][][] = [];
    let length = 0;
    for (const block of blocks)
        for (const [i, part] of partsOf(block.words).entries()) {
            const size = spokenText(part).text.length + 3;
            if (!chunks.length || (block.heading && i === 0) || length + size > MAX_CHUNK) {
                chunks.push([]);
                length = 0;
            }
            chunks.at(-1)!.push(part);
            length += size;
        }
    return chunks.map(chunkOf);
}

async function readPages(): Promise<Page[]> {
    const pages: Page[] = [];
    for await (const file of htmlFiles(SITE)) {
        const { document } = parseHTML(await readFile(file, 'utf8'));
        const region = document.querySelector('[data-narration]');
        if (!region) continue;
        // linkedom splits text at entities, so `Don&#39;t` arrives as three nodes; a browser parses one.
        region.normalize();
        const blocks = narratedBlocks(region);
        if (!blocks.length) continue;
        pages.push({
            path: '/' + relative(SITE, file).replace(/(index)?\.html$/, ''),
            key: pageKey(blocks),
            chunks: chunksOf(blocks),
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

/** Generates one chunk: its audio, and the timing of each character of its text. */
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
    const timing: Alignment = {
        starts: alignment.character_start_times_seconds.map(ms),
        ends: alignment.character_end_times_seconds.map(ms),
    };
    await writeFile(join(CACHE, `${chunk.key}.mp3`), Buffer.from(audio_base64, 'base64'));
    await writeFile(join(CACHE, `${chunk.key}.json`), JSON.stringify(timing));
}

/**
 * A chunk's words' starts and ends, from its stored character timings, fetched from the bucket when
 * this machine hasn't made them. Worked out per page, so a change in how text splits into words never
 * needs new audio.
 */
async function wordTimings(chunk: Chunk) {
    for (const ext of ['mp3', 'json']) {
        const file = join(CACHE, `${chunk.key}.${ext}`);
        if (!existsSync(file) && !(await download(`chunks/${chunk.key}.${ext}`, file)))
            throw new Error(`chunks/${chunk.key}.${ext} is in index.json but not in the bucket`);
    }
    const timing = JSON.parse(await readFile(join(CACHE, `${chunk.key}.json`), 'utf8')) as Alignment;
    // ElevenLabs times code points; offsets count UTF-16 units, two for an emoji. Spread each over its units.
    const points = Array.from(chunk.text);
    if (timing.starts.length !== points.length)
        throw new Error(
            `chunks/${chunk.key}.json times ${timing.starts.length} characters; its text has ${points.length}.`,
        );
    const perUnit = (times: number[]) => points.flatMap((point, i) => Array<number>(point.length).fill(times[i]));
    const [starts, ends] = [perUnit(timing.starts), perUnit(timing.ends)];
    return chunk.words.flatMap((word, i) => {
        const first = chunk.offsets[i];
        return [starts[first], ends[first + word.text.length - 1]];
    });
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
    for (const [i, chunk] of page.chunks.entries()) {
        if (i > 0) {
            parts.push(gap);
            at += GAP;
        }
        words.push(...(await wordTimings(chunk)).map((t) => ms(t + at)));
        const { wav, duration } = await decoded(join(CACHE, `${chunk.key}.mp3`));
        parts.push(wav);
        at += duration;
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
    const audio = createHash('sha256')
        .update(await readFile(mp3))
        .digest('hex');
    return {
        mp3,
        manifest: { version: NARRATION_VERSION, audio, duration: ms(at), words, voice: VOICE!, model: MODEL },
    };
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
        : { pages: {}, chunks: [] };
    // Narration v2 listed pages without their sections; those all re-stitch once.
    if (Array.isArray(index.pages)) index.pages = {};
    const sectionsOf = (page: Page) => page.chunks.map((chunk) => chunk.key);
    const pending = pages.filter(
        (page, i) =>
            index.pages[page.key]?.join() !== sectionsOf(page).join() &&
            pages.findIndex((p) => p.key === page.key) === i &&
            (!only || page.path === only),
    );
    const missing = [
        ...new Map(
            pending
                .flatMap((page) => page.chunks)
                .filter((chunk) => !index.chunks.includes(chunk.key))
                .map((chunk) => [chunk.key, chunk]),
        ).values(),
    ];
    const characters = missing.reduce((sum, chunk) => sum + chunk.text.length, 0);

    console.log(`${pages.length} narrated pages; ${pending.length} to narrate:`);
    for (const page of pending) console.log(`  ${page.path}`);
    console.log(`${missing.length} sections to generate: ${characters} characters (budget ${BUDGET}).`);
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
        // Saved after every section, so a run that fails later never pays for this one again.
        await saveIndex();
        console.log(`  generated ${i + 1}/${missing.length}`);
    }

    for (const page of pending) {
        const { mp3, manifest } = await stitch(page);
        const json = join(CACHE, page.key, 'page.json');
        await writeFile(json, JSON.stringify(manifest));
        // The audio first: the manifest that names it only goes up once it is there.
        await upload(`audio/${manifest.audio}.mp3`, mp3, 'audio/mpeg');
        await upload(`pages/${page.key}.json`, json, 'application/json');
        index.pages[page.key] = sectionsOf(page);
        await saveIndex();
        const { size } = await stat(mp3);
        await rm(join(CACHE, page.key), { recursive: true });
        console.log(`  narrated ${page.path}: ${Math.round(manifest.duration)} s, ${Math.round(size / 1024)} KiB`);
    }
}

await main();
