import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';
import { narratedBlocks, pageKey, PRONUNCIATIONS, spokenText } from './extract';

const region = (html: string) =>
    parseHTML(`<!doctype html><body><article data-narration>${html}</article>`).document.querySelector(
        '[data-narration]',
    )!;
const read = (html: string) => narratedBlocks(region(html)).map((block) => spokenText(block.words).text);

describe('narrated text', () => {
    it('reads a title and body block by block, leaving code, controls and marked parts silent', () => {
        expect(
            read(`
                <header><h1>Crunch Time</h1><div data-narration-skip>28 Jan 2023 <button>Copy</button></div></header>
                <p>A missed <em>deadline</em>, and then some.</p>
                <pre><code>const x = 1;</code></pre>
                <ul><li>First</li><li>Second <span aria-hidden="true">✓</span></li></ul>
                <p hidden>Never shown.</p>
            `),
        ).toEqual(['Crunch Time', 'A missed deadline, and then some.', 'First', 'Second']);
    });

    it('keeps a word split by markup as one spoken word, but as separate words on the page', () => {
        const [block] = narratedBlocks(region('<p>it was <em>any</em>way, <strong>fine</strong> now</p>'));
        expect(block.words.map((word) => word.text)).toEqual(['it', 'was', 'any', 'way,', 'fine', 'now']);
        expect(spokenText(block.words)).toEqual({ text: 'it was anyway, fine now', offsets: [0, 3, 7, 10, 15, 20] });
    });

    it('reads the same however a parser splits text into nodes', () => {
        const split = region('<p></p>');
        const p = split.querySelector('p')!;
        // linkedom splits text at entities, so `music,&quot; &quot;I` arrives as four nodes.
        for (const piece of ['"I want music,', '"', ' ', '"', 'I want books."'])
            p.append(p.ownerDocument.createTextNode(piece));
        const whole = region('<p>"I want music," "I want books."</p>');
        const read = (el: Element) => narratedBlocks(el).map((block) => spokenText(block.words).text);
        expect(read(split)).toEqual(read(whole));
    });

    it('reads a bare link as one word without its scheme, and a named link as its words', () => {
        const [block] = narratedBlocks(
            region('<p>See <a href="https://nuphory.com">https://nuphory.com</a>. Or <a href="/x">my site</a>.</p>'),
        );
        expect(spokenText(block.words).text).toBe('See nuphory.com. Or my site.');
        const link = block.words[1];
        expect(link.node.data.slice(link.start, link.end)).toBe('https://nuphory.com');
    });

    it('keys a page by exactly what it reads, so an edit changes the key and markup alone does not', () => {
        const original = pageKey(narratedBlocks(region('<p>Hello there.</p>')));
        expect(pageKey(narratedBlocks(region('<p>Hello <em>there.</em></p>')))).toBe(original);
        expect(pageKey(narratedBlocks(region('<p>Hello there!</p>')))).not.toBe(original);
    });

    it('keys a page by its words and sections too, so timings never land on other words', () => {
        const original = pageKey(narratedBlocks(region('<p>Hello there.</p><p>Next</p>')));
        // Same spoken text, but split into another number of words: the stored timings would not fit.
        expect(pageKey(narratedBlocks(region('<p>Hello there<em>.</em></p><p>Next</p>')))).not.toBe(original);
        // Same words, but a heading starts a new section, read by its own request.
        expect(pageKey(narratedBlocks(region('<p>Hello there.</p><h2>Next</h2>')))).not.toBe(original);
    });

    it('separates words at a line break', () => {
        expect(read('<p>one<br>two</p>')).toEqual(['one two']);
    });

    it('keys a page by the pronunciations it uses, so changing one re-narrates only pages that say it', () => {
        const says = narratedBlocks(region('<p>A WAV file.</p>'));
        const silent = narratedBlocks(region('<p>An MP3 file.</p>'));
        const before = [pageKey(says), pageKey(silent)];
        const alias = PRONUNCIATIONS.wav;
        PRONUNCIATIONS.wav = 'wahv';
        try {
            expect(pageKey(says)).not.toBe(before[0]);
            expect(pageKey(silent)).toBe(before[1]);
        } finally {
            PRONUNCIATIONS.wav = alias;
        }
    });
});
