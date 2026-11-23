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

`<mia-marker>` is a custom element, not a Svelte component, so any site can use it, Svelte or not.
Import it from its own entry point, `@mia-cx/ui/marker`, and call `defineMarker()` once in the browser
(in Svelte, `onMount(defineMarker)`), then wrap text in it:

```html
<mia-marker class="prose">…article…</mia-marker>
```

Selecting text inside it draws a highlight of its own: one block per line, as wide as that line's text,
sliding and stretching as the selection changes, with the covered text redrawn in the block's colour
exactly where a block covers it. Whole paragraphs, then whole heading sections, fill the gaps between
their lines. Clearing a selection wipes it away toward the click, farthest line first.

It is also a word cursor. Set `marker.word` to an index among its `wordCount` words (whitespace-separated
runs of text, outside `<pre>` and `aria-hidden`) and the highlight travels there; `-1` hides it. A narration with
word timings drives it from its audio clock, and seeks when the reader clicks or taps a word:

```ts
audio.addEventListener('timeupdate', () => (marker.word = wordIndexAt(audio.currentTime)));
marker.addEventListener('seek', (event) => (audio.currentTime = startOf(event.detail.word)));
```

`seek` fires only while a word is highlighted. A tap fires it at once, since touch selects by long press.
A click moves the cursor at once and fires it when `double-click` ms have passed since the press, so a
double-click selects its word instead; meanwhile the cursor holds on the clicked word. Clicks on links and
controls, clicks that clear a selection and the end of a drag never seek. `marker.wordAt(x, y)` maps any
other point to a word.

| Attribute             | Default  | Meaning                                                           |
| --------------------- | -------- | ----------------------------------------------------------------- |
| `word`                | `-1`     | The highlighted word                                              |
| `leading`, `trailing` | `200`    | Milliseconds for an edge moving outward, and inward               |
| `stagger`             | `150`    | Milliseconds between the first and last line clearing a selection |
| `double-click`        | `330`    | Milliseconds a second click still makes a double-click            |
| `padding`, `radius`   | `4`, `0` | Pixels of padding, and corner rounding (see below)                |

The word cursor takes `padding` on both sides and half of it above and below. Selected lines take only
the half above and below: each ends exactly where its selected text does, so it shows whether a trailing
space is selected.

Colours come from `--marker-color` and `--marker-text` (system highlight colours by default). The
redrawn text is a copy of the marker's children inside it, so style its content with descendant
selectors (`.prose p`), not child selectors on the marker. Form fields and forced-colors mode keep the
native selection, and reduced motion (or `data-motion="reduce"` on `<html>`) makes every change snap.
Safari on iOS still draws its system selection around the highlight, with its handles.
