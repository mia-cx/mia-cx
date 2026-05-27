import { Config } from "prettier";

import base from "./base";
import { Override } from "../../types/prettier";
import { PluginOptions as TailwindCSSPrettierConfig } from "prettier-plugin-tailwindcss";

/**
 * Keep in mind you will need to install the `prettier-plugin-glsl` package.
 * TODO integrate types from `prettier-plugin-glsl`.
 */
export const glsl: Config = {
	...base,
	plugins: [
		...new Set([
			...(base.plugins as string[]),
			"prettier-plugin-glsl",
		]),
	],
};

/**
 * Keep in mind you will need to install the `prettier-plugin-nginx` package.
 * TODO integrate types from `prettier-plugin-nginx`.
 */
export const nginx: Config = {
	...base,
	plugins: [
		...new Set([
			...(base.plugins as string[]),
			"prettier-plugin-nginx",
		]),
	],
};

/**
 * Keep in mind you will need to install the `prettier-plugin-sh` package.
 * TODO integrate types from `prettier-plugin-sh`.
 */
export const sh: Config = {
	...base,

	functionNextLine: true,
	indent: 2,
	switchCaseIndent: true,

	plugins: [
		...new Set([
			...(base.plugins as string[]),
			"prettier-plugin-sh",
		]),
	],
};

/**
 * Keep in mind you will need to install the `prettier-plugin-tailwindcss` package.
 */
export const tailwindcss: Config & TailwindCSSPrettierConfig = {
	...base,
	plugins: [
		...new Set([
			...(base.plugins as string[]),
			"prettier-plugin-tailwindcss",
		]),
	],
	overrides: [...new Set([...(base.overrides as Override[])])],
};

/**
 * Keep in mind you will need to install the `prettier-plugin-xml` package.
 * TODO integrate types from `prettier-plugin-xml`.
 */
export const xml: Config = {
	...base,

	xmlSortAttributesByKey: true,

	plugins: [
		...new Set([
			...(base.plugins as string[]),
			"prettier-plugin-xml",
		]),
	],
};

/**
 * Keep in mind you will need to install the `prettier-plugin-sh` and `prettier-plugin-xml` packages.
 */
export default {
	...base,
	...glsl,
	...sh,
	...tailwindcss,
	...xml,

	plugins: [
		...new Set([
			...(base.plugins as string[]),
			...(glsl.plugins as string[]),
			...(sh.plugins as string[]),
			...(tailwindcss.plugins as string[]),
			...(xml.plugins as string[]),
		]),
	],

	overrides: [
		...new Set([
			...(base.overrides as Override[]),
			...(glsl.overrides as Override[]),
			...(sh.overrides as Override[]),
			...(tailwindcss.overrides as Override[]),
			...(xml.overrides as Override[]),
		]),
	],
} satisfies Config;
