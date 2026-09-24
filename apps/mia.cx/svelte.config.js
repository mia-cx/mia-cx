import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        // Deployed as a Worker with static assets; the settings live in wrangler.jsonc.
        adapter: adapter(),
    },
};

export default config;
