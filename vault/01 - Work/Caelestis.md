---
tags:
  - work/code
listed: true
featured: true
created_at: 2026-08-02T00:00
description: "A fast, customisable template overlay for wplace.live, with a shared server and a progress dashboard."
stack:
  - TypeScript
  - Svelte
  - WebGL
live: "https://caelestis.mia.cx"
source: "https://github.com/mia-riezebos/Caelestis"
---

Caelestis gives groups painting on wplace.live a shared template server, keeps local and shared templates in one tree, and tracks painting progress without making the browser scan the whole template first.

It has three parts: a userscript that renders templates and adds painting tools to Wplace, a self-hostable server for shared templates, access control and telemetry, and a web dashboard for progress, pace, contributions and timelapses.

Templates render through WebGL, so pixel size, rounding, position, rotation, opacity and per-colour visibility all change without baking new image tiles.

Overlays should not make the browser scan an entire template before showing progress.

Groups need one shared source of truth for their artwork, not a folder of exports passed around.
