# mia.cx design notes

A site built around Mia's WebGPU field, which renders **on top of** the page. Content sits in a centred
column with left-aligned text, square corners, hairline separators and no card backgrounds. Borders are
reserved for controls.

## Routes

| Route              | What it is                                                                         |
| ------------------ | ---------------------------------------------------------------------------------- |
| `/`                | Hero, featured work, contact                                                       |
| `/work`            | The curated shortlist (`listed: true` in the vault), then a note linking to Svartz |
| `/work/[slug]`     | A write-up for any work note with a body; unlisted ones are reachable by URL only  |
| `/about`           | Mia's approved biography, followed by contact                                      |
| `/blog`            | Coming soon, linking to Svartz; post pages are parked in `parked/`                 |
| `/textile/terms`   | Terms for Textile and its hosted Discord MCP relay                                 |
| `/textile/privacy` | Data handling, retention, and privacy rights for Textile                           |

Everything prerenders to static files in `.svelte-kit/cloudflare/` through `adapter-cloudflare`, served as the assets of a Cloudflare Worker (see `wrangler.jsonc`).

## Markdown

Every page has a Markdown twin one `.md` away (`/` is `/index.md`), and `/llms.txt` lists them. The
twin is the page's own `<main>` converted by `src/hooks.server.ts`, so a new page gets one without any
extra work; mark anything that should stay out with `data-markdown="skip"`. AI agents, matched by user
agent, and anything sending `Accept: text/markdown` get the twin at the page's own URL from `worker.ts`.
Below each page, "View as Markdown" opens the twin and "Copy as Markdown" copies it.

## Home

The hero fills the viewport. The portrait sits in the left half and the text in the right: "I'm", the
name, the short bio with a Read more link to `/about`, pronouns, then the featured socials and a `+N`
menu. The portrait is cropped from the bottom with a soft mask fade. Its centre is pinned to `40vw` so it
keeps its place at every window size and zoom level. `--zoom` and `--drop` on `.portrait` set its scale
and vertical offset. On phones the text comes first and the portrait goes full-bleed underneath.

With a mouse the hero has depth: background, portrait, text, then the field nearest. The page puts the
mouse position on the root, and each layer follows it at once, shifting by its depth in steps of 7px by 4px
(`app.css`): the background stays put, the portrait moves two steps, the text three, the field four.
The text moves by relative offset, never a transform, which would cut it off from the sweater it
blends with on paper. The field's drift settles to nothing as the hero scrolls away, over the same
range as its dim, so it holds still over the rest of the page. `P` holds the field still. Touch and
reduced motion keep the hero still.

## The field

`ShaderCanvas` is fixed, full viewport, transparent, `pointer-events: none`, `z-index: 5`. Its
presentation pass derives alpha from luminance, so dark parts of the field are transparent and only the
bright lobes wash over the page, in both themes. The renderer files are
identical to `apps/shaderdemo`.

The site touches the field in two ways only:

- **Dim.** On the home page, opacity eases to half as the hero scrolls away, driven by the hero's
  `view-timeline` on the compositor with no scroll listener. Other routes sit at half, and route
  changes ease between the two.
- **Boot.** `onsettle` fires once the first frame is up or graphics fail, which starts the entrance.

The field sometimes covers the hero text. That is accepted: a glyph-mask imprint was tried and dropped.

`prefers-reduced-motion` pauses the field, hidden tabs pause rendering, unmount destroys the renderer.
`F` toggles the frame counter. `--atmosphere-bleed` grows the canvas past the viewport's edges, so the
hero's camera can move it.

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

Textile's terms and privacy policy appear in the footer sitemap. Both reuse the reading-page
typography, with an effective date and direct links between policies. Policy links have 44px targets.

## Shared pieces

Colour and type tokens, `GradientBlur`, `EasedGradient`, `Socials`, `SocialIcon` and
`ArrowLink` live in `packages/ui` so the next site can reuse them. The field lives in
`packages/atmosphere`. This app keeps only what is specific to it: the header's hero-driven spill,
the footer, contact, the routes, and the layout tokens (`--header-height`, `--content-width`,
`--gutter`).

## Palette

Defined in `@mia-cx/ui/tokens.css`, one `light-dark()` value per token. The site follows the system
preference until a visitor picks a theme with the header's toggle, which `app.html` restores before
paint; `/og` is always dark. Light takes the printed CV's Print palette, white paper and plum ink, with
the field still washing over the page as light. On wider screens the hero's intro and social icons run over the black sweater, so in light they
invert and blend with `difference`: ink on paper, paper on the sweater. The sweater stays solid under
them, since difference over its grey fade would match the grey.

| Token          | Light         | Dark          | Role                                           |
| -------------- | ------------- | ------------- | ---------------------------------------------- |
| `--haze`       | `#fff`        | `#221820`     | page and header tint                           |
| `--bg`         | `var(--haze)` | `var(--haze)` | page; matches the field before its first frame |
| `--panel-line` | `#dcd8d3`     | `#1a1c22`     | hairlines, control borders                     |
| `--ink`        | `#1c161a`     | `#e9e5dd`     | text                                           |
| `--ink-dim`    | `#6e6862`     | `#8f8b85`     | labels, metadata                               |
| `--ink-faint`  | `#b3ada6`     | `#4d4a47`     | quiet details                                  |
| `--accent`     | `#d61f6f`     | `#ff3d8a`     | hover, status, current page                    |
| `--violet`     | `#4b3fc9`     | `#5b4ddc`     | focus rings                                    |

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
