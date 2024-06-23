import { type Config } from 'prettier';

const overridableDefaults: Config = {
	endOfLine: 'lf',

	printWidth: 80,
	tabWidth: 4,

	useTabs: true,
}

const base: Config = {
	...overridableDefaults,

	bracketSameLine: true,

	experimentalTernaries: true,

	insertPragma: true,
	proseWrap: 'always',

	quoteProps: 'consistent',

	singleAttributePerLine: true,

	vueIndentScriptAndStyle: true,

	overrides: [
		{
			// JSON
			files: ["*.json?([c5])", ".prettierrc"],
			excludeFiles: ["package.json"],
			options: {
				useTabs: false,
			}
		},
		{
			// Package.json
			files: ["package.json"],
			options: {
				tabWidth: 2,
				useTabs: false,
			}
		},
		{
			// Markdown
			files: ["*.md?(?(sve)x)", "*.svx"],
			options: {
				tabWidth: 2,
				useTabs: false,
			}
		},
		{
			// HTML
			files: ["*.htm?({x,l?(x)})"],
			options: {
				printWidth: 120,
				useTabs: false,
			}
		},
		{
			// CSS
			files: ["*.?(s)[ac]ss", "*.less"],
			options: {
				useTabs: false,
			}
		},
		{
			// YAML
			files: ["*.y?(a)ml"],
			options: {
				tabWidth: 2,
				useTabs: false,
			}
		},
		{
			// JS/TS
			files: [
				"*.?([cm])[jt]s",
				"*.[jt]sx",
				// "*.{iced?(.md)},liticed",
				// "*.{c{s,offee?(.md)},litcoffee}",
			],
			options: {
				tabWidth: 8,
				useTabs: true,
			}
		}
	]
}

export default base;
