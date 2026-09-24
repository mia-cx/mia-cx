import svelte from '@mia-cx/config/eslint/svelte';

export default [...svelte, { ignores: ['src/baked-post-plan.generated.ts'] }];
