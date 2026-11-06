import { sveltekit } from '@sveltejs/kit/vite';
import { withSvartzHost } from '@svartz/vite/host';
import Icons from 'unplugin-icons/vite';
import { defineConfig } from 'vitest/config';

// `svartz dev` and `svartz build` supply the vault modules and rebuild them when a note changes.
export default withSvartzHost(
    defineConfig({
        // Icons compile to inline SVG at build time, so nothing is fetched at runtime.
        plugins: [sveltekit(), Icons({ compiler: 'svelte' })],
        // The field ships as source; SvelteKit must compile it for SSR and prerendering too.
        ssr: { noExternal: ['@mia-cx/atmosphere', '@mia-cx/print', '@mia-cx/ui'] },
        test: { include: ['src/**/*.test.ts'] },
    }),
);
