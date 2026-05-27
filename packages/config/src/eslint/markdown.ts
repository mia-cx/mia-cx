import { TSESLint } from "@typescript-eslint/utils";
import eslintConfigPrettier from "eslint-config-prettier";
import { base } from "./base";
import eslintPluginMarkdown from "eslint-plugin-markdown";
import eslintPluginMdx from "eslint-plugin-mdx";

export const markdown: TSESLint.FlatConfig.ConfigArray = [
	...base,
	{
		files: ["*.md"],
		...(eslintPluginMarkdown.configs
			.recommended as TSESLint.FlatConfig.Config),
		rules: {
			//
		},
	},
];

export const mdx: TSESLint.FlatConfig.ConfigArray = [
	...base,
	{
		files: ["*.mdx"],
		...(eslintPluginMdx.configs
			.recommended as TSESLint.FlatConfig.Config),
		rules: {
			//
		},
	},
];

export default [
	...new Set([...base, ...markdown, ...mdx, eslintConfigPrettier]),
] as TSESLint.FlatConfig.ConfigArray;
