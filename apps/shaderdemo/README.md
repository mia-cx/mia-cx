# Chromatic Atmosphere

Standalone SvelteKit/WebGPU shader study for `shaderdemo.mia.cx`. The static build output is `dist/` and can be uploaded directly to Cloudflare Pages.

```sh
pnpm --filter @mia-cx/shaderdemo dev
pnpm --filter @mia-cx/shaderdemo test
pnpm --filter @mia-cx/shaderdemo build
```

WebGPU requires a compatible browser and a secure context (HTTPS or localhost). Every shader stage is runtime-toggleable; debug views expose the field, edge mask, and transformed layer.
