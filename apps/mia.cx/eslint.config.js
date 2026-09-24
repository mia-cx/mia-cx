import svelte from '@mia-cx/config/eslint/svelte';

export default [
    ...svelte,
    { ignores: ['dist/', '.svelte-kit/', '.wrangler/', 'src/lib/content/vault.generated.ts', 'parked/'] },
];
