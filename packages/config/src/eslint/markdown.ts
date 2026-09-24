import eslintMarkdown from "@eslint/markdown";
import type { TSESLint } from "@typescript-eslint/utils";
import eslintConfigPrettier from "eslint-config-prettier";
import * as eslintPluginMdx from "eslint-plugin-mdx";
import { base } from "./base";

export const md: TSESLint.FlatConfig.ConfigArray = [
    ...base,
    ...(eslintMarkdown.configs.recommended as TSESLint.FlatConfig.ConfigArray),
];

/** The 1.x name, kept so existing `{ markdown }` imports keep loading. */
export const markdown = md;

export const mdx: TSESLint.FlatConfig.ConfigArray = [
    ...base,
    {
        files: ["**/*.mdx"],
        ...(eslintPluginMdx.flat as TSESLint.FlatConfig.Config),
    },
];

export default [...new Set([...base, ...md, ...mdx, eslintConfigPrettier])] as TSESLint.FlatConfig.ConfigArray;
