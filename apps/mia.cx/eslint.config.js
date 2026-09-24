import svelte from '@mia-cx/config/eslint/svelte';

export default [...svelte, { ignores: ['dist/', '.svelte-kit/', 'src/lib/content/vault.generated.ts', 'parked/'] }];
