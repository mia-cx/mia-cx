import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
import Icons from 'unplugin-icons/vite';
import type { Plugin, ViteDevServer } from 'vite';
import { defineConfig } from 'vitest/config';

// Not import.meta.dirname: Node 18, which Cloudflare's builder still runs, does not have it.
const vault = fileURLToPath(new URL('../../vault', import.meta.url));

/** Rebuild the generated content whenever a note changes, so `dev` reflects the vault live. */
function vaultWatcher(): Plugin {
    const regenerate = () => {
        try {
            execFileSync('pnpm', ['generate:content'], { stdio: 'inherit' });
        } catch {
            // The generator prints its own errors; keep the dev server alive.
        }
    };
    return {
        name: 'vault-watcher',
        apply: 'serve',
        configureServer(server: ViteDevServer) {
            server.watcher.add(vault);
            server.watcher.on('all', (_event: string, path: string) => {
                if (path.startsWith(vault) && path.endsWith('.md')) regenerate();
            });
        },
    };
}

export default defineConfig({
    // Icons compile to inline SVG at build time, so nothing is fetched at runtime.
    plugins: [sveltekit(), Icons({ compiler: 'svelte' }), vaultWatcher()],
    // The field ships as source; SvelteKit must compile it for SSR and prerendering too.
    ssr: { noExternal: ['@mia-cx/atmosphere'] },
    test: { include: ['src/**/*.test.ts'] },
});
