import type { TSESLint } from "@typescript-eslint/utils";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginSvelte from "eslint-plugin-svelte";
import tseslint from "typescript-eslint";
import { base } from "./base";

export const svelte: TSESLint.FlatConfig.ConfigArray = [
    ...base,
    ...eslintPluginSvelte.configs["flat/recommended"],
    {
        files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
        languageOptions: {
            parserOptions: {
                // Script blocks are TypeScript; the Svelte parser hands them to this one.
                parser: tseslint.parser,
                extraFileExtensions: [".svelte"],
            },
        },
    },
    {
        files: ["**/*.svelte"],
        rules: {
            // TypeScript checks names in script blocks; ESLint does not know the DOM globals here.
            "no-undef": "off",
        },
    },
    {
        rules: {
            // Static sites link with plain hrefs; SvelteKit's resolve() is for apps with a base path.
            "svelte/no-navigation-without-resolve": "off",
        },
    },
] as TSESLint.FlatConfig.ConfigArray;

export default [
    ...new Set([...base, ...svelte, ...eslintPluginSvelte.configs["flat/prettier"], eslintConfigPrettier]),
] as TSESLint.FlatConfig.ConfigArray;
