# @mia-cx/marker

<a href="https://0rwx.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://0rwx.com/static/AI-W-dark.svg">
    <img alt="AI:W" src="https://0rwx.com/static/AI-W-light.svg" height="48">
  </picture>
</a>

`<mia-marker>`: a highlight that draws text selections, and a word cursor for narration. A custom
element with no dependencies, so any site can use it, whatever its framework.

```bash
npm install @mia-cx/marker
```

Call `defineMarker()` once in the browser (in Svelte, `onMount(defineMarker)`), then wrap text in it:

```ts
import { defineMarker } from '@mia-cx/marker';
defineMarker();
```

```html
<mia-marker class="prose">…article…</mia-marker>
```

## Selections

Selecting text inside it draws a highlight of its own: one block per line, as wide as that line's text,
sliding and stretching as the selection changes, with the covered text redrawn in the block's colour
exactly where a block covers it. Whole paragraphs, then whole heading sections, fill the gaps between
their lines. Clearing a selection wipes it away toward the click, farthest line first.

## Narration

It is also a word cursor. Set `marker.word` to an index among its `wordCount` words (whitespace-separated
runs of text, outside `<pre>` and `aria-hidden`) and the highlight travels there; `-1` hides it. A
narration with word timings drives it from its audio clock, and seeks when the reader clicks or taps a
word:

```ts
audio.addEventListener('timeupdate', () => (marker.word = wordIndexAt(audio.currentTime)));
marker.addEventListener('seek', (event) => (audio.currentTime = startOf(event.detail.word)));
```

`seek` fires only while a word is highlighted. A tap fires it at once, since touch selects by long press.
A click moves the cursor at once and fires it when `double-click` ms have passed since the press, so a
double-click selects its word instead; meanwhile the cursor holds on the clicked word. While a word is
highlighted, `double-click` also decides which two clicks make a double-click, whatever the system's own
speed, so a reader can match it to how they click. Clicks on links and
controls, clicks that clear a selection and the end of a drag never seek. `marker.wordAt(x, y)` maps any
other point to a word.

When the word changes, each edge waits `leading-delay` or `trailing-delay` ms after the word is spoken
before it moves, so the trail can lag behind the voice. The trailing edge never sets off before the
leading one, so a `trailing-delay` shorter than `leading-delay` acts as equal to it. A negative delay makes
an edge move before the word is spoken. For that, set `word` `marker.lookahead` ms early: how far below
zero the leading delay goes, or 0.

```ts
const ahead = () => audio.currentTime + marker.lookahead / 1000;
audio.addEventListener('timeupdate', () => (marker.word = wordIndexAt(ahead())));
```

### Narrating parts separately

To narrate each paragraph on its own, either:

- wrap each paragraph in its own `<mia-marker>`. Each numbers its words from 0, so a paragraph's word
  timings drive its own marker directly. A selection across paragraphs is drawn by every marker it
  touches; or
- keep one marker around them all. `marker.wordIndexOf(paragraph)` is the index of the paragraph's first
  word, so its own word `i` is `marker.wordIndexOf(paragraph) + i`.

Keep controls such as a play button outside the marker, so their labels aren't counted as words.

## Attributes

| Attribute                         | Default  | Meaning                                                                     |
| --------------------------------- | -------- | --------------------------------------------------------------------------- |
| `word`                            | `-1`     | The highlighted word                                                        |
| `leading`, `trailing`             | `200`    | Milliseconds for an edge moving outward, and inward                         |
| `leading-delay`, `trailing-delay` | `0`      | Milliseconds after a word is spoken that its edges start moving; may be < 0 |
| `stagger`                         | `150`    | Milliseconds between the first and last line clearing a selection           |
| `double-click`                    | `330`    | Milliseconds a second click still makes a double-click                      |
| `padding`, `radius`               | `4`, `0` | Pixels of padding, and corner rounding (see below)                          |

The word cursor takes `padding` on both sides and half of it above and below. Selected lines take only
the half above and below: each ends exactly where its selected text does, so it shows whether a trailing
space is selected.

## Styling

Colours come from `--marker-color` and `--marker-text` (system highlight colours by default). The
redrawn text is a copy of the marker's children inside it, so style its content with descendant
selectors (`.prose p`), not child selectors on the marker. The copy drops `anchor-name` and
`view-transition-name`, so anchors and view transitions keep using the page's own elements. Form fields and forced-colors mode keep the
native selection, and reduced motion makes every change snap. `data-motion="reduce"` or `"full"` on
`<html>` overrides the system's reduced-motion setting.
Safari on iOS still draws its system selection around the highlight, with its handles.
