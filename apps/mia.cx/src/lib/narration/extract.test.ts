import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';
import { narratedBlocks, pageKey, spokenText } from './extract';

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

    it('keys a page by exactly what it reads, so an edit changes the key and markup alone does not', async () => {
        const original = await pageKey(narratedBlocks(region('<p>Hello there.</p>')));
        expect(await pageKey(narratedBlocks(region('<p>Hello <em>there</em>.</p>')))).toBe(original);
        expect(await pageKey(narratedBlocks(region('<p>Hello there!</p>')))).not.toBe(original);
    });
});
