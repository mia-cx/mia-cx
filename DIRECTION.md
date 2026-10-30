<!-- @format -->

# Direction

mia.cx is Mia Riezebos's personal site, with work, writing, biography, and contact details. Keep its existing visual
identity and shared reading-page typography when adding content.

The active site lives in `apps/mia.cx` on `main`. The root checkout may still use the older `legacy` branch; start new
work from `origin/main` in a separate worktree. Cloudflare Workers serves the prerendered site at `https://mia.cx`.

Releases follow Caelestis: GitHub Actions deploys every push to `main` to `https://staging.mia.cx`, and only a merged
Changesets release pull request deploys to production. Visitor-facing changes carry a `@mia-cx/mia.cx` changeset. CI
uses the organisation's Cloudflare account variable and token rather than Cloudflare's own Git builds.

## Textile policies

Host Textile's public terms at `/textile/terms` and privacy policy at `/textile/privacy`. Keep both reachable from the
site footer and linked to each other.

These policies cover Textile's Discord application and the hosted Discord MCP relay. The implementation lives in
`mia-cx/discord-mcp`, not this repository. Check that implementation and its deployed infrastructure before changing
data-handling claims. Discord OAuth identifies the caller; each request's separate bot token determines Discord access.
Do not describe OAuth as proof of bot ownership or personal server permissions.

The policies name Mia Riezebos as operator and use the site's existing contact address. Keep their effective date
current when materially changing the published terms.

## Printing and the CV

Every page that isn't an Article prints Mia's CV; Articles print themselves, and index pages add an Appendix (terms in
`CONTEXT.md`). The CV is two A4 pages in the site's own look, in two Themes: Colour on dark paper, Print on white with
the field multiplied in like ink. `/cv` and `/cv.pdf` are the only Worker-rendered routes; role presets live in Workers
KV. The print mechanism is the workspace package `@mia-cx/print`, kept free of CV specifics so Svartz can adopt it. All
of it shipped in 0.1.1 (PRD #86). `/cv.pdf` prints through Cloudflare Browser Rendering on the free plan's daily browser
time, so each render is cached for the day. Safari prints Articles inside page margins, because it can't repeat padding
across pages, and there the field stops at those margins. The site's light theme (#90) reuses the Print theme's ink
treatment: white paper with the field multiplied in.
