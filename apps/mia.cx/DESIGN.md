# mia.cx design notes

A site built around Mia's WebGPU field, which renders **on top of** the page. Content sits in a centred
column with left-aligned text, square corners, hairline separators and no card backgrounds. Borders are
reserved for controls.

## Routes

| Route          | What it is                                                                        |
| -------------- | --------------------------------------------------------------------------------- |
| `/`            | Hero, featured work, contact                                                      |
| `/work`        | The curated shortlist (`listed: true` in the vault), then a note linking to Svartz |
| `/work/[slug]` | A write-up for any work note with a body; unlisted ones are reachable by URL only |
| `/about`       | Mia's approved biography, followed by contact                                     |
| `/blog`        | Coming soon, linking to Svartz; post pages are parked in `parked/`                 |

Everything prerenders to static files in `dist/` through `adapter-static`.

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

The site touches the field in three ways only:

- **Dim.** On the home page, opacity eases to half as the hero scrolls away, driven by the hero's
  `view-timeline` on the compositor with no scroll listener. Other routes sit at half, and route
  changes ease between the two.
- **Light mode.** `filter: invert(1) hue-rotate(180deg)` keeps the hues and flips the lightness.
- **Boot.** `onsettle` fires once the first frame is up or graphics fail, which starts the entrance.

The field sometimes covers the hero text. That is accepted: a glyph-mask imprint was tried and dropped.

`prefers-reduced-motion` pauses the field, hidden tabs pause rendering, unmount destroys the renderer.
`F` toggles the frame counter.

## First load

Shaders compile in the browser and cannot be shipped precompiled, so a first visit waits for them.
`app.html` sets `data-boot="loading"` on `<html>` before paint, which hides the page and shows a ring
after 350 ms. The layout moves it to `entering` when the shader settles, or after 4 s at most. The ring
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

Wordmark, "Contribute to this website", socials with `+N`, email, copyright, and a Sitemap. Internal
links end in → which slides on hover. External links end in a still ↗ raised to cap height.

## Palette

Dark by default, with a light theme. The toggle has three states: following the system, forced light, or
forced dark. Choosing the system's own theme clears the override.

| Token          | Dark      | Light     | Role                              |
| -------------- | --------- | --------- | --------------------------------- |
| `--bg`         | `#070809` | `#f3efe8` | page                              |
| `--panel-line` | `#1a1c22` | `#dcd6ce` | hairlines, control borders        |
| `--haze`       | `#221820` | `#e6dde2` | header tint                       |
| `--ink`        | `#e9e5dd` | `#1b1519` | text                              |
| `--ink-dim`    | `#8f8b85` | `#6b6560` | labels, metadata                  |
| `--ink-faint`  | `#4d4a47` | `#b3ada6` | quiet details                     |
| `--accent`     | `#ff3d8a` | `#d61f6f` | hover, status, current page       |
| `--violet`     | `#5b4ddc` | `#4b3fc9` | focus rings                       |

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
