import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        // Deployed as a Worker with static assets; the settings live in wrangler.jsonc. The adapter
        // reads its own config, because it writes its Worker over whatever `main` names.
        adapter: adapter({ config: 'wrangler.sveltekit.jsonc' }),
    },
};

export default config;
