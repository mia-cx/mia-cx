---
tags:
  - work/code
listed: true
created_at: 2026-05-28T00:00
description: "A stateless, deterministic, lossless URL compressor."
status: Work in progress
stack:
  - TypeScript
  - Rust
  - Cloudflare Workers
live: "https://piss.zip"
source: "https://github.com/mia-riezebos/lossless-url-compressor"
---

piss.zip compresses URLs into short links that are deterministic and lossless: the same URL always produces the same link, and the original is recovered from the link itself.

It is a specification plus a TypeScript proof of concept, with the redirect path running on Hono and Cloudflare Workers.

A short link should not need a database. Stateless and deterministic means nothing to lose and nothing to look up.
