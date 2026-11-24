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
}

/** Bumped whenever the extraction or the audio format changes, so every page is narrated afresh. */
export const NARRATION_VERSION = 1;

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

/** The blocks of words narrated inside a `data-narration` region, in reading order. */
export function narratedBlocks(region: Element): NarratedBlock[] {
    const blocks: NarratedBlock[] = [];
    let owner: Element | undefined;
    let last: { node: Text; end: number } | undefined;

    const visit = (node: Node, block: Element) => {
        if (node.nodeType === TEXT_NODE) {
            const text = node as Text;
            for (const match of text.data.matchAll(/\S+/g)) {
                if (owner !== block) {
                    owner = block;
                    last = undefined;
                    blocks.push({ words: [] });
                }
                // A word that starts its text node right where the previous one ended, with no space on
                // either side, is the same written word split by markup.
                const joined = !!last && last.node !== text && match.index === 0 && last.end === last.node.data.length;
                const end = match.index + match[0].length;
                blocks.at(-1)!.words.push({ node: text, start: match.index, end, text: match[0], joined });
                last = { node: text, end };
            }
            // Whitespace after the last word separates it from whatever follows.
            if (last?.node === text && last.end < text.data.length) last = { node: text, end: -1 };
            return;
        }
        if (node.nodeType !== ELEMENT_NODE || silent(node as Element)) return;
        const el = node as Element;
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

/** SHA-256 of a string, as hex. Web Crypto, so the build and the browser hash alike. */
export async function sha256(input: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The key a page's narration is stored under: a hash of exactly what is read aloud. The page and its
 * narration meet only through this, so any edit to the text means no audio until it is narrated again,
 * never audio that no longer matches.
 */
export const pageKey = (blocks: NarratedBlock[]) =>
    sha256([`narration v${NARRATION_VERSION}`, ...blocks.map((block) => spokenText(block.words).text)].join('\n'));

/**
 * A narrated page as stored: the stitched audio, and every narrated word's start and end in seconds, in
 * reading order, flat as `[start0, end0, start1, end1, …]`.
 */
export interface NarrationManifest {
    version: number;
    duration: number;
    words: number[];
    voice: string;
    model: string;
}
