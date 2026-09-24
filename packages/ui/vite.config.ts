import { svelte } from '@sveltejs/vite-plugin-svelte';
import Icons from 'unplugin-icons/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [svelte(), Icons({ compiler: 'svelte' })],
    test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
