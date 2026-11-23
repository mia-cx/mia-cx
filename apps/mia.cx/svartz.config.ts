import { defineConfig } from '@svartz/config';

/**
 * One vault, `vaults/` at the repository root, mounted at the site root: its `work/` and `blog/`
 * folders are the site's /work and /blog, so Svartz's URLs and links are the site's own. Svartz is
 * only the backend: it publishes the index with every body as resolved Markdown, and mia.cx renders
 * and styles the pages.
 */
export default defineConfig({
    version: '1.0.0',
    defaults: {
        theme: '@svartz/theme-minimal',
        index: { markdown: true },
        discovery: {
            // Every page already has a Markdown twin from src/hooks.server.ts, listed in /llms.txt.
            llms: { enabled: false },
            // The site shows only the dates a note states, not Git or file dates.
            dateSources: ['frontmatter'],
        },
    },
    vaults: [
        {
            id: 'site',
            path: '../../vaults',
            mountPath: '/',
            // The vault's own documentation, for whoever opens it.
            exclude: ['README.md'],
            target: { type: 'host' },
            site: { title: 'mia.cx' },
        },
    ],
});
