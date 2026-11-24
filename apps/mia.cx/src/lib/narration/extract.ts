/**
 * The words a page narrates, read from its DOM. The narration build reads the prerendered page with
 * this, and the player reads the live page with it, so the audio's word timings line up with the words
 * on screen.
 *
 * A page opts in with `data-narration` on the element holding what is read aloud: a post's title and
 * body. Inside it, code blocks, controls, anything `aria-hidden` or `hidden`, and anything marked
 * `data-narration-skip` stay silent. A word is a whitespace-separated run of text, as `<mia-marker>`
 * counts them. Words group into blocks, one per paragraph, heading or list item; each block is narrated
 * by one request.
 */
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/** One narrated word: where it is in the page, and how it reads. */
export interface NarratedWord {
    node: Text;
    start: number;
    end: number;
    text: string;
    /** Whether it continues the previous word with no space between, as `<em>any</em>way` does. */
    joined: boolean;
}

export interface NarratedBlock {
    words: NarratedWord[];
    /** Whether it is a heading, which starts a section. */
    heading: boolean;
}

/**
 * Bumped whenever the stored format changes, so every page is narrated afresh. Sections keep
 * ElevenLabs' timing for every character, so a change to how text splits into words needs no new audio.
 */
export const NARRATION_VERSION = 3;

const SILENT = new Set(['PRE', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'BUTTON', 'NAV', 'TEMPLATE']);
const BLOCKS = new Set([
    'P',
    'LI',
    'DT',
    'DD',
    'BLOCKQUOTE',
    'FIGCAPTION',
    'TD',
    'TH',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
]);
const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

const silent = (el: Element) =>
    SILENT.has(el.tagName.toUpperCase()) ||
    el.getAttribute('aria-hidden') === 'true' ||
    el.hasAttribute('hidden') ||
    el.hasAttribute('data-narration-skip');

/** A link whose text is its own URL, such as `https://mia.cx`: read as one word, without the scheme. */
const BARE_URL = /^(https?:\/\/)(\S+)$/;

/** The blocks of words narrated inside a `data-narration` region, in reading order. */
export function narratedBlocks(region: Element): NarratedBlock[] {
    const blocks: NarratedBlock[] = [];
    let owner: Element | undefined;
    let last: { node: Text; end: number } | undefined;

    const push = (block: Element, node: Text, start: number, end: number, text: string) => {
        if (owner !== block) {
            owner = block;
            last = undefined;
            blocks.push({ words: [], heading: /^H[1-6]$/.test(block.tagName.toUpperCase()) });
        }
        // A word that starts its text node right where the previous one ended, with no space on
        // either side, is the same written word split by markup.
        const joined = !!last && last.node !== node && start === 0 && last.end === last.node.data.length;
        blocks.at(-1)!.words.push({ node, start, end, text, joined });
        last = { node, end };
    };

    const visit = (node: Node, block: Element) => {
        if (node.nodeType === TEXT_NODE) {
            const text = node as Text;
            for (const match of text.data.matchAll(/\S+/g))
                push(block, text, match.index, match.index + match[0].length, match[0]);
            // Whitespace at the end separates the last word from whatever follows, also when the node is
            // nothing but whitespace: parsers differ in where they split text into nodes.
            if (/\s$/.test(text.data)) last = { node: text, end: -1 };
            return;
        }
        if (node.nodeType !== ELEMENT_NODE || silent(node as Element)) return;
        const el = node as Element;
        // A line break separates words like a space does.
        if (el.tagName.toUpperCase() === 'BR') return void (last = undefined);
        const only = el.childNodes.length === 1 ? el.firstChild : null;
        const url =
            el.tagName.toUpperCase() === 'A' && only?.nodeType === TEXT_NODE && BARE_URL.exec(only.textContent!);
        if (url) return push(block, only as Text, 0, url[0].length, url[2]);
        const next = BLOCKS.has(el.tagName.toUpperCase()) ? el : block;
        for (const child of el.childNodes) visit(child, next);
    };
    for (const child of region.childNodes) visit(child, region);
    return blocks;
}

/** A block as it is read aloud, and where each word starts in that text. */
export function spokenText(words: NarratedWord[]) {
    let text = '';
    const offsets: number[] = [];
    words.forEach((word, i) => {
        if (i > 0 && !word.joined) text += ' ';
        offsets.push(text.length);
        text += word.text;
    });
    return { text, offsets };
}

/**
 * SHA-256 of a string, as hex, alike in the build and the browser. Not Web Crypto: browsers hide it
 * outside secure contexts, such as the dev server opened over the network.
 */
export const sha256 = (input: string) => bytesToHex(nobleSha256(utf8ToBytes(input)));

/**
 * How the voice should say words it misreads: each whole word, in any case, is read as its alias. The
 * narration script keeps an ElevenLabs pronunciation dictionary of exactly these.
 */
export const PRONUNCIATIONS: Record<string, string> = {
    caelestis: 'kai lestis',
    nuphory: 'new phorie',
    wav: 'wave',
    wplace: 'double-u place',
};

/** The pronunciation rules a text uses, or undefined for none. */
export function pronunciationsIn(text: string) {
    const used = Object.entries(PRONUNCIATIONS).filter(([word]) => new RegExp(`\\b${word}\\b`, 'i').test(text));
    return used.length ? Object.fromEntries(used) : undefined;
}

/**
 * The key a page's narration is stored under: a hash of exactly what is read aloud and how. That is
 * the text, where each word starts, which blocks are headings (they start sections), and the
 * pronunciations it uses. The page and its narration meet only through this. Any edit means no audio
 * until it is narrated again, never audio whose timings belong to other words, including when the
 * browser and the build would split the text differently.
 */
export function pageKey(blocks: NarratedBlock[]) {
    const read = blocks.map((block) => ({ heading: block.heading, ...spokenText(block.words) }));
    const said = pronunciationsIn(read.map(({ text }) => text).join('\n'));
    return sha256(JSON.stringify({ v: NARRATION_VERSION, read, said }));
}

/**
 * A narrated page as stored at `pages/<key>.json`: its stitched audio, at `audio/<audio>.mp3`, and every
 * narrated word's start and end in seconds, in reading order, flat as `[start0, end0, start1, end1, …]`.
 */
export interface NarrationManifest {
    version: number;
    /** The SHA-256 of the audio, which names it; a page narrated afresh gets new audio, never a changed file. */
    audio: string;
    duration: number;
    words: number[];
    voice: string;
    model: string;
}
