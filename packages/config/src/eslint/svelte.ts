import { TSESLint } from "@typescript-eslint/utils";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginSvelte from "eslint-plugin-svelte";
import { base } from "./base";

export const svelte: TSESLint.FlatConfig.ConfigArray = [
	...base,
	...eslintPluginSvelte.configs["flat/recommended"],
	{
		rules: {
			//
		},
	},
] as TSESLint.FlatConfig.ConfigArray;

export default [
	...new Set([
		...base,
		...svelte,
		...eslintPluginSvelte.configs["flat/prettier"],
		eslintConfigPrettier,
	]),
] as TSESLint.FlatConfig.ConfigArray;
