# @mia-cx/marker

## 0.1.1

### Patch Changes

- 7f382fc: A `word` set on `<mia-marker>` before `defineMarker()` runs now takes effect, instead of silently disabling the word cursor.
- f128a92: `<mia-marker>` isolates its own stacking context, so the highlight no longer paints over sticky headers and other layers outside it.

## 0.1.0

### Minor Changes

- e13a177: First public release of `<mia-marker>`: a highlight that draws text selections one line at a time and wipes them away toward the click, and a word cursor for narration, with `seek` on click or tap and `wordIndexOf()` for narrating parts of a page separately.
