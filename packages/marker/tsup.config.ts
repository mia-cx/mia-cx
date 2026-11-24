import { defineConfig } from 'tsup';

// One browser module and its types: the element has no dependencies and only runs where the DOM does.
export default defineConfig({
    clean: true,
    entry: ['./src/index.ts'],
    dts: true,
    format: ['esm'],
    outDir: 'dist/',
    target: ['es2022'],
    treeshake: 'recommended',
    tsconfig: './tsconfig.json',
});
