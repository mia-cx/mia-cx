import { Config } from "prettier";
import { Override } from "../../types/prettier";
import base from "./base";
import { tailwindcss } from "./extra";
import svelte from "./svelte";

export const astro: Config = {
	...base,
	plugins: [
		...new Set([
			...(base.plugins as string[]),
			"prettier-plugin-astro",
		]),
	],

	overrides: [
		...new Set([
			...(base.overrides as Override[]),
			{
				files: ["*.astro"],
				options: {
					parser: "astro",
				},
			},
		]),
	],
};

export default {
	...base,
	...astro,
	...svelte,
	...tailwindcss,

	plugins: [
		...new Set([
			...(base.plugins as string[]),
			...(astro.plugins as string[]),
			...(svelte.plugins as string[]),
			...(tailwindcss.plugins as string[]),
		]),
	],

	overrides: [
		...new Set([
			...(base.overrides as Override[]),
			...(astro.overrides as Override[]),
			...(svelte.overrides as Override[]),
			...(tailwindcss.overrides as Override[]),
		]),
	],
} satisfies Config;
