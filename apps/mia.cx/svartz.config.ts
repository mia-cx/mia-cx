import { defineConfig } from '@svartz/config';

/**
 * The vaults at the repository root, one per section. Svartz is only the backend: it publishes
 * each vault's index with every body as resolved Markdown, and mia.cx renders and styles the pages.
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
            id: 'work',
            path: '../../vaults/work',
            mountPath: '/work',
            target: { type: 'host' },
            site: { title: 'Work' },
        },
        {
            id: 'blog',
            path: '../../vaults/blog',
            mountPath: '/blog',
            target: { type: 'host' },
            site: { title: 'Blog' },
        },
    ],
});
