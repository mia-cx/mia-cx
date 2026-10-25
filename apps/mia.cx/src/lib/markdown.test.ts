import { describe, expect, it } from 'vitest';
import { markdownPath, pagePath } from './markdown';

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
