---
tags:
  - work/code
created_at: 2026-07-06T00:00
description: "A Discord moderation bot that catches scam and spam raids with honeypot channels. Built on protocord."
stack:
  - TypeScript
  - SQLite
  - Docker
  - Kubernetes
source: "https://github.com/mia-cx/honeybot"
---

Honeybot catches scam and spam raids using honeypot channels, cross-channel repeat detection with a configurable time window, a known-scam evidence corpus searched by exact, fuzzy and embedding lookup, and text and image classifiers.

Moderators get case review, corpus listing, per-guild prevention and punishment policies, and a punishment DM interface, all inside Discord.

Built for self-hosting: SQLite persistence, filesystem evidence, Docker images and k3s manifests are all first-class deployment paths.
