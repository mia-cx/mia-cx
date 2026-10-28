# Svartz print surface: where a print package hooks in

Research for [#75](https://github.com/mia-cx/mia-cx/issues/75), part of [#73](https://github.com/mia-cx/mia-cx/issues/73).

**Question.** A shared print package has to (1) choose per page what prints, the page itself or an embedded document such as the CV, (2) ship print CSS, and possibly (3) emit a PDF at build time. Where does it attach in Svartz, what does mia.cx offer at the same points, and how much do the two share?

**Sources.**

- Svartz `mia-cx/svartz` at `a8245edcba7f676e9a7f0f851cdf1e9b67f1c558` (`origin/sveltekit-rewrite`, the default branch, 2.1.0). The local checkout at `~/Development/mia-cx/svartz` is 448 commits behind and has uncommitted edits, so this note reads an export of the remote commit. Svartz paths below are relative to that repo.
- mia.cx at `daf048c` (`origin/main`). Paths are relative to this repo.
- PR #72 (`feat/markdown-pages`) at `9733f0b`.
- SvelteKit 2.70.3, the version mia.cx installs (`apps/mia.cx/package.json:27`), for build-hook order.

## Answer

Svartz has no print support today. Neither `@media print` nor a print stylesheet appears anywhere outside its vendored Quartz reference. Both codebases nonetheless offer the same three seams, because a Svartz site is an ordinary SvelteKit app: the root `+layout.svelte`, CSS imported from that layout, and Vite plugins in the app's `vite.config.ts`. A package built on those seams (a Svelte component, a CSS file and an optional Vite plugin) drops into both unchanged. Only one input differs: how the layout learns whether the current page is an Article.

## 1. Choosing what prints

### Svartz

- **The root layout belongs to the site.** `svartz init` writes `src/routes/+layout.svelte` as a bare `{@render children()}` (`packages/cli/template/src/routes/+layout.svelte:1-5`), and the generated catchall renders every vault page inside it (`packages/cli/template/src/routes/[...slug]/+page.svelte:15`). An embedded, hidden CV mounted in that layout sits beside every vault page, just as it does in mia.cx. Host apps keep their own layout and routes (`docs/host-vaults.md:3`, `:19`).
- **The per-page signal is frontmatter.** Each note's published frontmatter reaches the runtime as `IndexEntry.properties` (`packages/core/src/types.ts:251`; `docs/vault-view.md:18`). A layout or route reads it with `prepareHostVault(pathname)` and `vault.artifacts.vault.note(href)?.entry` (`docs/host-vaults.md:23`, `:80-81`). The generated catchall `load` currently returns only stylesheets (`packages/cli/template/src/routes/[...slug]/+page.ts:6-14`), so it would also have to return a `print` value before the layout could read it from `page.data`.
- **List pages have no note.** The home, tag and folder listings render without an `entry` (`themes/minimal/src/lib/layouts/SiteLayout.svelte:52-58`, `:159-168`), so they find no frontmatter and fall back to the default. That fits "every page that isn't an Article prints the CV".
- **Theme regions are the wrong seam.** A theme can swap `header`, `navigation`, `pageHead`, `aside`, `pageFoot` or `footer` (`themes/minimal/src/lib/extension.ts:127`, `:138-156`), but only the primary theme's regions apply (`SiteLayout.svelte:145-151`). A print package that swapped a region would collide with any theme that swaps the same one.
- **Frontmatter already picks other things per page.** A page's `theme:`, or its nearest folder note's, picks its renderer (`docs/composing-themes.md:28-37`). A `print:` key could cascade from folder notes the same way, but nothing in Svartz implements that for keys other than `theme:`.

### mia.cx

- **Same seam.** `apps/mia.cx/src/routes/+layout.svelte` already branches on the page, using `page.url.pathname` for the hero and the bare `/og` card (`:13-15`, `:61-71`), so it can branch on Article versus not-Article in the same way.
- **The per-page signal is the route.** Articles are `work/[slug]`, `blog/[slug]` and the Textile policies (`apps/mia.cx/src/routes/`; the policies render through `src/lib/components/LegalDocument.svelte:16`). The first two have a `load` (`src/routes/work/[slug]/+page.ts:5`, `src/routes/blog/[slug]/+page.ts:8`), which could return an `article` flag. The policies have no `load`, so a route-id list in the layout is the uniform option.
- **Frontmatter is available too.** The generated vault index keeps unpromoted frontmatter on each entry (`src/lib/content/vault.ts:26-27`; `scripts/generate-content.ts:35`) and follows Svartz's conventions (`scripts/generate-content.ts:1-12`). A `print:` key in the vault would work in both sites for vault-backed pages. It cannot reach `/`, `/about` or the policies, which have no note.
- **Keep the CV out of the Markdown twins (PR #72).** The twin is built from `<main>` only and drops `[aria-hidden="true"]` and `[data-markdown="skip"]` (`apps/mia.cx/src/hooks.server.ts:8`, `:14-18` on `9733f0b`). A CV mounted outside `<main>` in the layout never reaches a twin. A CV placed inside `<main>` needs `data-markdown="skip"`.

## 2. Shipping print CSS

### Svartz

- **Layout import.** The CSS reaches every page, vault or not, when the root layout imports it, as minimal's layout does with `@svartz/ui/base.css` and `prose.css` (`themes/minimal/src/lib/layouts/SiteLayout.svelte:10-11`).
- **Content plugin, zero-config.** A plugin can register a CSS `BrowserResource` (`packages/core/src/plugin/compiler.ts:7-13`) that works with every theme. `presentation()` is the precedent: it adds a stylesheet and a script from `transformGfm` (`packages/plugins/src/presentation.ts:27-47`), and the user enables it with `plugins: [presentation()]` in `svartz.config.ts` (`packages/config/src/schemas/svartz.ts:151`). The CSS is imported by the generated `virtual:svartz/artifacts` module (`packages/vite/src/artifacts.ts:76-81`, `:98`), so it loads only on vault pages. A host's own routes miss it.
- **Theme build extension.** A theme's Node entry can carry the same plugin (`themes/minimal/src/lib/extension.ts:159-167`), merged by id across composed themes (`themes/minimal/src/lib/compose.ts:39-40`, `:66-77`). This only makes sense if a theme wants print on by default.
- **Token mismatch.** Svartz styles read `--sv-*` tokens (`SiteLayout.svelte:241-245`). The print stylesheet should carry its own values instead of reading either site's tokens.

### mia.cx

- **Layout import.** `+layout.svelte` already imports `../app.css` (`:2`). Neither the app nor any package has print CSS today, so a print stylesheet imported there would be the only one.

## 3. Emitting a PDF at build time

### Both: the same SvelteKit build hooks

- SvelteKit prerenders inside its `writeBundle` hook (sequential), then defers the adapter to `closeBundle` "so that adapters copy files created by other Vite plugins" (`@sveltejs/kit/src/exports/vite/index.js:1258-1259`, `:1539`, `:1594-1595`, `:1631-1636`). A Vite plugin listed after `sveltekit()` with a sequential `writeBundle` can read the prerendered CV page from `.svelte-kit/output/prerendered/pages`, print it with Chromium, and write `cv.pdf` into `.svelte-kit/output/client`. The adapter then ships it like any static file. This order is read from the source, not tested.
- Svartz already uses this seam: `svartz:vite` writes generated assets into `output/client` from `writeBundle` (`packages/vite/src/index.ts:334-344`).
- The `svartz build` CLI loads the site's own `vite.config.ts` and merges its plugins into the build (`packages/cli/src/index.ts:557`, `:576`, `:596`). The `init` template's config is plain `withSvartzHost(defineConfig({ plugins: [tailwindcss(), sveltekit()] }))` (`packages/cli/template/vite.config.ts:7`, `:14`), so a print Vite plugin added after `sveltekit()` runs in `svartz build` too. mia.cx's plugin list is `apps/mia.cx/vite.config.ts:34`.

### Svartz-only alternative

- A content plugin can emit any file as an artifact (`packages/core/src/types.ts:119-128`), the way discovery emits `rss.xml` (`packages/plugins/src/emit-discovery.ts:38`, `:178`). This happens in the pipeline, which runs in Vite's `buildStart` (`packages/vite/src/index.ts:321-323`), before any page is rendered. A PDF made there would come from the source, not from the printed page with its print CSS.

### Constraint: Chromium on the builder

- Cloudflare builds mia.cx with `pnpm --filter @mia-cx/mia.cx build` (`apps/mia.cx/README.md:40`), and its builder still runs Node 18 (`apps/mia.cx/vite.config.ts:8`). Nothing shows that a Chromium binary is available there.
- mia.cx's one existing browser render, `scripts/share-card.ts`, drives a Chromium you already have open over CDP and writes `static/og.jpg`, which is committed (`apps/mia.cx/scripts/share-card.ts:1-13`). A PDF made the same way, from a script whose output is committed, avoids the builder question entirely.

## What the two surfaces share and where they differ

| Seam | mia.cx | Svartz | Shared |
| --- | --- | --- | --- |
| Embed the CV | `src/routes/+layout.svelte` | the site's `src/routes/+layout.svelte` (init template) | yes: one Svelte component |
| Article signal | route id or `load` data | note frontmatter (`entry.properties`), read through `prepareHostVault` or the catchall `load` | no: each site passes a boolean in |
| Print CSS | import in the layout | import in the layout, or a content plugin's CSS `BrowserResource` | yes, if imported from the layout |
| PDF | Vite plugin after `sveltekit()`, or a committed script | the same Vite plugin, which `svartz build` loads | yes |
| Markdown twin | PR #72 hook converts `<main>` | discovery writes a copy from the note's source (`docs/discovery.md:52`) | no: keep the CV outside `<main>` |

**Differences that matter for the package's API.**

- **Themes.** Svartz pages render through a composed theme whose frame and regions vary (`docs/composing-themes.md`), so the print CSS cannot assume mia.cx's layout. It should hide the whole page (`body > *`) and show only its own element, without targeting theme classes.
- **Vault frontmatter.** Svartz decides per note, and folder notes already cascade `theme:`. mia.cx decides per route. The package should take "this page prints itself" as a prop and leave the source of that boolean to each site.
- **Build orchestration.** `svartz build` runs one `viteBuild` per standalone vault or one shared build for host vaults (`packages/cli/src/index.ts:579-596`, `README.md:43`). A Vite plugin runs once per build. A multi-vault standalone repo would emit a PDF per vault output unless the plugin is configured per vault.
- **Paraglide.** Svartz's own `apps/web` shell runs Paraglide (`apps/web/vite.config.ts:68`). mia.cx doesn't yet. A CV component that takes its copy as props or a snippet stays neutral to both.

## Open for the PRD

- Whether the PDF is built on Cloudflare's builder, which needs Chromium there, or generated locally and committed, as `og.jpg` is.
- Which frontmatter key, if any, Svartz notes use for "print myself" and whether it cascades from folder notes like `theme:`.
