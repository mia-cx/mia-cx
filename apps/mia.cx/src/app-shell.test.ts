import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../../../packages/ui/src/tokens.css', import.meta.url), 'utf8');

describe('app shell', () => {
    it("is the theme's paper before the first frame, in the browser chrome too", () => {
        expect(app).toContain('viewport-fit=cover');
        // Prettier may break the tag across lines, so match its attributes loosely.
        expect(app).toMatch(
            /<meta\s+name="theme-color"\s+content="#221820"\s+media="\(prefers-color-scheme: dark\)"\s+data-scheme="dark"\s*\/>/,
        );
        expect(app).toMatch(
            /<meta\s+name="theme-color"\s+content="#ffffff"\s+media="\(prefers-color-scheme: light\)"\s+data-scheme="light"\s*\/>/,
        );
        expect(css).toContain("@import '@mia-cx/ui/tokens.css'");
        expect(tokens).toContain('--haze: light-dark(#fff, #221820)');
        expect(tokens).toContain('--bg: var(--haze)');
        expect(css).toContain('background: var(--bg)');
    });
});
