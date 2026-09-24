import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');

describe('app shell', () => {
    it("is the field's dark base before the first frame, in the browser chrome too", () => {
        expect(app).toContain('viewport-fit=cover');
        // Prettier may break the tag across lines, so match its attributes loosely.
        expect(app).toMatch(
            /<meta\s+name="theme-color"\s+content="#221820"\s+media="\(prefers-color-scheme: dark\)"\s*\/>/,
        );
        expect(css).toContain('--haze: #221820');
        expect(css).toContain('--bg: var(--haze)');
        expect(css).toContain('background: var(--bg)');
    });
});
