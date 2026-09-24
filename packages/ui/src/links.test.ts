import { describe, expect, it } from 'vitest';
import { isExternalHref } from './links';

describe('isExternalHref', () => {
    it('treats anything with a scheme as leaving the site', () => {
        for (const href of ['https://github.com/mia-cx', 'mailto:hello@mia.cx', 'ftp://x'])
            expect(isExternalHref(href)).toBe(true);
    });
    it('keeps paths, anchors and queries internal', () => {
        for (const href of ['/work', '/#contact', '?page=2', 'work/vesta']) expect(isExternalHref(href)).toBe(false);
    });
});
