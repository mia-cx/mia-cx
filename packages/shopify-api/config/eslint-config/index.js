const { resolve } = require("node:path");

const project = resolve(process.cwd(), "tsconfig.json");

/*
 * This is a custom ESLint configuration for use with
 * typescript packages.
 *
 * This config extends the Vercel Engineering Style Guide.
 * For more information, see https://github.com/vercel/style-guide
 *
 */

module.exports = {
	extends: [
		"@vercel/style-guide/eslint/node",
		"@vercel/style-guide/eslint/typescript",
		"eslint-config-prettier",
		"eslint-config-turbo",
	].map(require.resolve),
	parserOptions: {
		project,
	},
	settings: {
		"import/resolver": {
			typescript: {
				project,
			},
		},
	},
	ignorePatterns: ["node_modules/", "dist/"],
	rules: {
		"import/no-default-export": "off",
	},
};
