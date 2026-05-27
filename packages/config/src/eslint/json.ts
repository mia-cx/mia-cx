import { TSESLint } from "@typescript-eslint/utils";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginJsonc from "eslint-plugin-jsonc";
import { base } from "./base";

export const json: TSESLint.FlatConfig.ConfigArray = [
	...base,
	...eslintPluginJsonc.configs["flat/recommended-with-json"],
	...eslintPluginJsonc.configs["flat/recommended-with-jsonc"],
	...eslintPluginJsonc.configs["flat/recommended-with-json5"],
	{
		files: ["*.json?([c5])"],
		rules: {
			//
		},
	},
];

export default [
	...new Set([
		...base,
		...json,
		...eslintPluginJsonc.configs["flat/prettier"],
		eslintConfigPrettier,
	]),
] as TSESLint.FlatConfig.ConfigArray;
