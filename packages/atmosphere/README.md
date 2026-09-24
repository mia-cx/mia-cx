# @mia-cx/atmosphere

The Chromatic Atmosphere field. A WebGPU renderer (`renderer`) with a full WebGL2 port
(`webgl2-renderer`), picked by `render-backend`, and `ShaderCanvas.svelte`, which floats the field over a
page as a fixed, transparent layer.

`src/default-settings.json` is the canonical look. `apps/shaderdemo` is the playground for tuning it:
export the settings there and paste the file here. `pnpm build` then bakes two artifacts from it, the
adjustment LUT (`src/baked-adjustment-lut.bin`, loaded through Vite's `?url`) and the post-effect plan
(`src/baked-post-plan.generated.ts`). Both are committed so consumers need no build step.

Consumers import by module: `@mia-cx/atmosphere/renderer`, `@mia-cx/atmosphere/ShaderCanvas.svelte`,
and so on. Everything ships as source and is compiled by the consuming app's Vite.
