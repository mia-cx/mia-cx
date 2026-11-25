# @mia-cx/marker

## 0.2.0

### Minor Changes

- f69593c: `leading-delay` and `trailing-delay` hold each edge of the word cursor back after the word is spoken, so the trail can lag behind the voice. A negative delay moves that edge ahead of the voice: `marker.lookahead` says how early to set `word` for it.

### Patch Changes

- 54dd979: The highlight's copy of the page drops `anchor-name` and `view-transition-name`. A popover anchored to an element inside the marker stays visible once the highlight has drawn, and view transitions keep using the page's own elements.
- 3a1c4a1: While a word is highlighted, the `double-click` setting decides which two clicks make a double-click, whatever the system's own speed. `data-motion="full"` on `<html>` turns the highlight's motion back on when the system asks for reduced motion.

## 0.1.1

### Patch Changes

- 7f382fc: A `word` set on `<mia-marker>` before `defineMarker()` runs now takes effect, instead of silently disabling the word cursor.
- f128a92: `<mia-marker>` isolates its own stacking context, so the highlight no longer paints over sticky headers and other layers outside it.

## 0.1.0

### Minor Changes

- e13a177: First public release of `<mia-marker>`: a highlight that draws text selections one line at a time and wipes them away toward the click, and a word cursor for narration, with `seek` on click or tap and `wordIndexOf()` for narrating parts of a page separately.
