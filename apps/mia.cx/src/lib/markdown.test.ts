import { describe, expect, it } from 'vitest';
import { markdownPath, pagePath, wantsMarkdown } from './markdown';

describe('markdown twins', () => {
    it('round-trips every page, the home page and trailing slashes included', () => {
        expect(markdownPath('/')).toBe('/index.md');
        expect(markdownPath('/work/')).toBe('/work.md');
        for (const page of ['/', '/about', '/work/caelestis']) expect(pagePath(markdownPath(page))).toBe(page);
    });

    it('leaves other files alone', () => {
        expect(pagePath('/llms.txt')).toBeUndefined();
        expect(pagePath('/work/caelestis')).toBeUndefined();
    });
});

describe('who gets Markdown', () => {
    const browser = 'Mozilla/5.0 (Macintosh) Chrome/150.0';

    it('follows Accept, case-insensitively and by quality', () => {
        expect(wantsMarkdown('text/markdown', browser)).toBe(true);
        expect(wantsMarkdown('TEXT/MARKDOWN', browser)).toBe(true);
        expect(wantsMarkdown('text/markdown, text/html;q=0.9', browser)).toBe(true);
        expect(wantsMarkdown('text/html, text/markdown;q=0.5', browser)).toBe(false);
        expect(wantsMarkdown('text/html, text/markdown;q=0', browser)).toBe(false);
    });

    it('gives AI agents Markdown unless they refuse it, and browsers HTML', () => {
        expect(wantsMarkdown('text/html,*/*;q=0.8', 'Mozilla/5.0 (compatible; ClaudeBot/1.0)')).toBe(true);
        expect(wantsMarkdown('text/markdown;q=0', 'GPTBot/1.2')).toBe(false);
        expect(wantsMarkdown('text/html,*/*;q=0.8', browser)).toBe(false);
    });
});
