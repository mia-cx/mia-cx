# @mia-cx/print

What a site prints. Every page that isn't an **Article** prints the site's print content, such as a CV,
in place of itself; an Article prints itself. Ships as source; the consuming app's Vite compiles it
(add it to `ssr.noExternal`).

## Use

Render `PrintSwitch` once in the root layout, outside `<main>`, and pass it whether the page is an
Article:

```svelte
<PrintSwitch article={page.data.article === true}>
  <CV />
</PrintSwitch>
```

The site decides where the Article flag comes from: mia.cx sets `article: true` in the page data of
its write-ups and policies; a notes site could read it from frontmatter.

The swap is pure `@media print`: the content is hidden on screen, and in print everything except the
content and the elements that hold it is hidden. No JavaScript runs, so `beforeprint`'s gaps (iOS
especially) don't matter.

## Pages

`print.css` sets A4 with margins for ordinary printed pages. Mark an element `data-print-sheet` to make
it one whole page, drawn edge to edge with no margin: a CV sheet, say. Each sheet ends its page.
