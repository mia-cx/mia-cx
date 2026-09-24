# mia.cx design notes

A site built around Mia's WebGPU field, which renders **on top of** the page. Content sits in a centred
column with left-aligned text, square corners, hairline separators and no card backgrounds. Borders are
reserved for controls.

## Routes

| Route          | What it is                                                                         |
| -------------- | ---------------------------------------------------------------------------------- |
| `/`            | Hero, featured work, contact                                                       |
| `/work`        | The curated shortlist (`listed: true` in the vault), then a note linking to Svartz |
| `/work/[slug]` | A write-up for any work note with a body; unlisted ones are reachable by URL only  |
| `/about`       | Mia's approved biography, followed by contact                                      |
| `/blog`        | Coming soon, linking to Svartz; post pages are parked in `parked/`                 |

Everything prerenders to static files in `.svelte-kit/cloudflare/` through `adapter-cloudflare`, served as the assets of a Cloudflare Worker (see `wrangler.jsonc`).

## Home

The hero fills the viewport. The portrait sits in the left half and the text in the right: "I'm", the
name, the short bio with a Read more link to `/about`, pronouns, then the featured socials and a `+N`
menu. The portrait is cropped from the bottom with a soft mask fade. Its centre is pinned to `40vw` so it
keeps its place at every window size and zoom level. `--zoom` and `--drop` on `.portrait` set its scale
and vertical offset. On phones the text comes first and the portrait goes full-bleed underneath.

## The field

`ShaderCanvas` is fixed, full viewport, transparent, `pointer-events: none`, `z-index: 5`. Its
presentation pass derives alpha from luminance, so dark parts of the field are transparent and only the
bright lobes wash over the page. The renderer files are identical to `apps/shaderdemo`.

The site touches the field in two ways only:

- **Dim.** On the home page, opacity eases to half as the hero scrolls away, driven by the hero's
  `view-timeline` on the compositor with no scroll listener. Other routes sit at half, and route
  changes ease between the two.
- **Boot.** `onsettle` fires once the first frame is up or graphics fail, which starts the entrance.

The field sometimes covers the hero text. That is accepted: a glyph-mask imprint was tried and dropped.

`prefers-reduced-motion` pauses the field, hidden tabs pause rendering, unmount destroys the renderer.
`F` toggles the frame counter.

## First load

Shaders compile in the browser and cannot be shipped precompiled, so a first visit waits for them.
`app.html` sets `data-boot="loading"` on `<html>` before paint, which hides the page and shows a ring
after 350 ms. The layout moves it to `entering` once the GPU has finished the shader's first frame
(each renderer exposes this as `firstFrame`), at once if graphics fail or the device is lost, or after 12 s if
the GPU stalls. If the app bundle never hydrates, the shell reveals on its own after 5 s. The ring
blurs out while blocks blur and rise in, staggered by `--enter`. The attribute is then removed, so later
navigations do not animate. Animations fill backwards only, because a lingering `filter` would stop the
header's backdrop blur. Without JavaScript nothing is hidden, and reduced motion gets a plain fade.

## Header

Ported from `mia-cx/maal`, without the rounded corners.

- `GradientBlur`: stacked `backdrop-filter` layers, blur 12, detail 4, each masked to its own band.
- `EasedGradient`: a `--haze` tint on an `easeOutQuad` curve.
- The bottom edge spills from `-60%` to `-500%` and settles at `-150%` as the hero exits, on the same
  view timeline, with a scroll-listener fallback. No `isolation` or negative `z-index` on the layers:
  both cut what the backdrop filter can sample.

## Footer

Wordmark, "Contribute to this website", socials with `+N`, email, copyright, and a Sitemap. Links use
`ArrowLink` from `@mia-cx/ui`: internal links end in → which slides on hover, external ones in a still
↗ raised to cap height.

## Shared pieces

Colour and type tokens, `GradientBlur`, `EasedGradient`, `Socials`, `SocialIcon` and
`ArrowLink` live in `packages/ui` so the next site can reuse them. The field lives in
`packages/atmosphere`. This app keeps only what is specific to it: the header's hero-driven spill,
the footer, contact, the routes, and the layout tokens (`--header-height`, `--content-width`,
`--gutter`).

## Palette

Defined in `@mia-cx/ui/tokens.css`. Dark only: a light theme was tried, and the inverted shader and
the hero text over the black sweater both suffered, so it was removed.

| Token          | Value         | Role                                           |
| -------------- | ------------- | ---------------------------------------------- |
| `--haze`       | `#221820`     | page and header tint                           |
| `--bg`         | `var(--haze)` | page; matches the field before its first frame |
| `--panel-line` | `#1a1c22`     | hairlines, control borders                     |
| `--ink`        | `#e9e5dd`     | text                                           |
| `--ink-dim`    | `#8f8b85`     | labels, metadata                               |
| `--ink-faint`  | `#4d4a47`     | quiet details                                  |
| `--accent`     | `#ff3d8a`     | hover, status, current page                    |
| `--violet`     | `#5b4ddc`     | focus rings                                    |

## Type

Archivo Variable with its width axis. Display sizes run at `font-stretch: 70–76%`, body text at normal
width. `.mono` is the system monospace, uppercase, for labels and metadata only. Every page, the header
and the footer share `.container`: 880px maximum with responsive gutters.

## Content

Work and posts come from the Obsidian vault at the repo root; see `vault/README.md` for its properties.
`scripts/generate-content.ts` turns published notes into `vault.generated.ts` at build time, resolving
wikilinks and failing the build on a broken one. Svartz will replace this once it can publish the vault.

## Screenshots

The site needs a GPU and a page the compositor considers visible. An occluded tab never completes WebGPU
work, so the renderer hangs at "Starting graphics…". Use a headless browser, or drive an existing one over
CDP with `Page.setWebLifecycleState: active`, which avoids raising any window.
