---
tags:
  - work/code
created_at: 2026-07-23T00:00
description: "System-wide AI autocomplete for macOS. Bring your model, press Tab."
status: Public alpha
stack:
  - Swift
  - Python
source: "https://github.com/mia-cx/stenotab"
---

StenoTab places translucent completion text at the caret in supported native macOS editors and tested web-backed apps. Tab accepts the next word, Option-Tab accepts the whole suggestion.

It finds the focused field, text context, caret geometry and typography through the accessibility APIs, and excludes secure fields. A shadow text buffer with a 45 ms debounce keeps latency down, dropping stale responses and cancelling only when an edit actually diverges.

Suggestions survive continued typing that matches the prediction, and reanchor after accepted text and across line wrapping.

Completions should be short, low-latency continuations that sound like the person typing, not an assistant answering them.

Bring your own model.
