import { Config } from "prettier";
import { PrettierConfig as SveltePrettierConfig } from "prettier-plugin-svelte";
import { type Override } from "../../types/prettier";

import base from "./base";
import { tailwindcss } from "./extra";

export const svelte: SveltePrettierConfig = {
	...base,
	svelteStrictMode: true,

	plugins: [
		...new Set([
			...(base.plugins as string[]),
			"prettier-plugin-svelte",
		]),
	],
	overrides: [
		...new Set([
			...(base.overrides as Override[]),
			{
				files: ["*.svelte"],
				options: {
					parser: "svelte",
				},
			},
			{
				// Markdown
				files: ["*.svx"],
				options: {
					tabWidth: 2,
					useTabs: false,
					parser: "markdown",
				},
			},
		]),
	],
};

export default {
	...base,
	...svelte,
	...tailwindcss,
	plugins: [
		...new Set([
			...(base.plugins as string[]),
			...(svelte.plugins as string[]),
			...(tailwindcss.plugins as string[]),
		]),
	],
	overrides: [
		...new Set([
			...(base.overrides as Override[]),
			...(svelte.overrides as Override[]),
			...(tailwindcss.overrides as Override[]),
		]),
	],
} satisfies Config;
