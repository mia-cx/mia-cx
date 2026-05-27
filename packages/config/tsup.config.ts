import { defineConfig } from "tsup";

export default defineConfig({
	cjsInterop: true,
	clean: true,

	entry: ["./src/**/*.[tj]s"],
	external: ["eslint", "prettier", "typescript"],

	// experimentalDts: true,
	dts: true,

	format: ["cjs", "esm"],

	// minify: "terser",
	outDir: "dist/",

	// splitting: true,
	target: ["esnext"],
	treeshake: "recommended",

	tsconfig: "./tsconfig.json",
});
