# @mia-cx/ui

Design tokens and the Svelte components shared by mia.cx sites. Ships as source; the consuming app's
Vite compiles it (add it to `ssr.noExternal`), and `unplugin-icons` with the Lucide and Simple Icons
sets must be in the app's Vite config, since the components import `~icons/*`.

## Tokens

`@mia-cx/ui/tokens.css` defines the colour, type and control tokens, dark and light. The system
preference picks the palette; `data-theme="light"` or `"dark"` on `<html>` forces one, and
`ThemeToggle` sets it. Import it before any site styles. A site that wants a different look keeps the
token names and changes the values; every component follows.

## Components

- `ArrowLink`: a link that ends in an arrow. Internal links get → that slides on hover; anything with
  a scheme gets a still, raised ↗.
- `GradientBlur` and `EasedGradient`: the progressive backdrop blur and eased tint from maal, for
  headers that sit over the field.
- `Socials`: bare icons for the featured networks plus a `+N` button opening the rest. Takes the two
  lists as props. `SocialIcon` maps a `SocialId` to its icon.
- `ThemeToggle`: one button that flips between light and dark, and drops the stored choice when it
  matches the system preference. The site restores the choice before paint from `localStorage.theme`.

## Marker

`<mia-marker>` is a custom element, not a Svelte component, so any site can use it. Call
`defineMarker()` once in the browser (in Svelte, `onMount(defineMarker)`), then wrap text in it:

```html
<mia-marker class="prose" skew-head="12" skew-tail="12">…article…</mia-marker>
```

Selecting text inside it draws a highlight of its own: one block per line, as wide as that line's text,
sliding and stretching as the selection changes, with the covered text redrawn in the block's colour
exactly where a block covers it. Whole paragraphs, then whole heading sections, fill the gaps between
their lines. Clearing a selection wipes it away toward the click, farthest line first.

It is also a word cursor. Set `marker.word` to an index among its `wordCount` words (whitespace-separated
runs of text, outside `<pre>`) and the highlight travels there; `-1` hides it. A narration with word
timings drives it from its audio clock, and `marker.wordAt(x, y)` turns a click into a word for seeking:

```ts
audio.addEventListener('timeupdate', () => (marker.word = wordIndexAt(audio.currentTime)));
```

| Attribute               | Default  | Meaning                                                           |
| ----------------------- | -------- | ----------------------------------------------------------------- |
| `word`                  | `-1`     | The highlighted word                                              |
| `leading`, `trailing`   | `200`    | Milliseconds for an edge moving outward, and inward               |
| `stagger`               | `150`    | Milliseconds between the first and last line clearing a selection |
| `padding`, `radius`     | `4`, `0` | Pixels around each line, and corner rounding                      |
| `skew-head`,`skew-tail` | `0`      | Degrees the leading and trailing ends lean, like a marker stroke  |

Colours come from `--marker-color` and `--marker-text` (system highlight colours by default). The
redrawn text is a copy of the marker's children inside it, so style its content with descendant
selectors (`.prose p`), not child selectors on the marker. Form fields and forced-colors mode keep the
native selection, and reduced motion (or `data-motion="reduce"` on `<html>`) makes every change snap.
