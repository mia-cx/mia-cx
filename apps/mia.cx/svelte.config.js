import process from 'node:process';
import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        // Deployed as a Worker with static assets; the settings live in wrangler.jsonc. The adapter
        // reads its own config, because it writes its Worker over whatever `main` names.
        adapter: adapter({
            config: 'wrangler.sveltekit.jsonc',
            // `pnpm dev` plays narration from the real bucket; builds and tests use a local, empty one, so
            // they need no Cloudflare login.
            platformProxy: { remoteBindings: process.env.npm_lifecycle_event?.startsWith('dev') ?? false },
        }),
        prerender: {
            // Project posts have nothing to prerender until some project has one; every other unseen route fails.
            handleUnseenRoutes: ({ routes, message }) => {
                if (routes.some((route) => route !== '/work/[slug]/[post]')) throw new Error(message);
            },
        },
    },
};

export default config;
