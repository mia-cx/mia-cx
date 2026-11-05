import { describe, expect, it, vi } from 'vitest';
import { render } from './vault';

vi.mock('virtual:svartz/host', () => ({
    vaults: ['work', 'blog'].map((id) => ({ id, artifacts: { index: { entries: [], backlinks: {} } } })),
}));

describe('heading ids', () => {
    it('preserves GitHub-style ids, inline markup and duplicate suffixes', () => {
        const html = render('# Slope & Tilt\n\n# <em>Slope & Tilt</em>');
        expect(html).toContain('<h1 id="slope--tilt">Slope &amp; Tilt</h1>');
        expect(html).toContain('<h1 id="slope--tilt-1"><em>Slope &amp; Tilt</em></h1>');
    });

    it.each([
        ['# <scr<script>ipt>Heading', 'iptheading'],
        ['# <script', 'script'],
    ])('keeps malformed markup out of heading ids: %s', (markdown, id) => {
        expect(render(markdown)).toContain(`<h1 id="${id}">`);
    });
});
