---
tags:
  - work/code
publish: true
created: 2026-09-07T00:00
summary: "A self-hosted media server written from scratch to be fast where Jellyfin is slow."
status: In development
stack:
  - TypeScript
source: "https://github.com/mia-cx/pendia"
---

Pendia is a self-hosted media server built to be fast in the places Jellyfin is slow: scanning, browsing, playback start and startup.

One image, one binary. Movies, series, music, photos, ebooks, audiobooks, live TV and channels, each with a browser built for that medium. Plugins are TypeScript.

The apps you already use keep working through translation layers: the Jellyfin API for video, OpenSubsonic for music, OPDS for ebooks.

Replacing a media server should not mean replacing every client that talks to it.

Licensed MPL 2.0 with network use counted as distribution, so hosted forks stay open.
