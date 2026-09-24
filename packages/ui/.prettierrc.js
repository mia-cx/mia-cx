// Self-contained: the @mia-cx/prettier-config package this used to import no longer exists.
// The whole scaffold is replaced by the @mia-cx/ui rebuild in the next PR.
export default {
	useTabs: true,
	singleQuote: true,
	trailingComma: 'all',
	printWidth: 100,
	plugins: ['prettier-plugin-svelte'],
};
