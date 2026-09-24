import js from "@eslint/js";
import type { TSESLint } from "@typescript-eslint/utils";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

/** JavaScript and TypeScript, without formatting rules: Prettier owns those. */
export const base: TSESLint.FlatConfig.ConfigArray = [
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        ignores: ["**/dist/**", "**/build/**", "**/.svelte-kit/**", "**/node_modules/**"],
    },
    {
        rules: {
            // A leading underscore marks a deliberately unused binding.
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
            ],
            // `catch {}` is how a best-effort call says it does not care.
            "no-empty": ["error", { allowEmptyCatch: true }],
            // @ts-nocheck and friends need a reason on the same line.
            "@typescript-eslint/ban-ts-comment": [
                "error",
                { "ts-nocheck": "allow-with-description", "ts-expect-error": "allow-with-description" },
            ],
        },
    },
];

export default [...base, eslintConfigPrettier] as TSESLint.FlatConfig.ConfigArray;
