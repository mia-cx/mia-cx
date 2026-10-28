<!-- @format -->

# Print tech survey: browser print vs paged-media tools

Research for [#74](https://github.com/mia-cx/mia-cx/issues/74), part of [#73](https://github.com/mia-cx/mia-cx/issues/73). Checked on 2026-10-28. Current stable releases: Chrome 156, Firefox 158 and Safari 27.0 ([wpt.fyi runs][wpt-runs]). Compatibility data comes from MDN browser-compat-data 8.1.7, published 2026-10-22 ([BCD][bcd]), unless stated otherwise.

## Facts a print-package decision depends on

- **`@media print` alone can swap the page.** A print stylesheet can hide the visible page and reveal an element hidden on screen, with no JavaScript. The `hidden` attribute is only a UA-stylesheet `display: none`, so author CSS overrides it ([HTML rendering][html-hidden]). The HTML spec has browsers run the same printing steps for the browser's own print command as for `print()` ([HTML printing steps][html-print]).
- **Print events are not a reliable swap mechanism.** The browser prints the document as it stands right after `beforeprint` ([HTML printing steps][html-print]). Work started asynchronously in the handler misses the print. On iOS, `beforeprint`/`afterprint` fire twice per `print()` call ([WebKit 316284][wk-316284]). In a Home Screen web app on iOS 27, `print()` does nothing and fires no events ([WebKit 327504][wk-327504]).
- **Page size, margins and breaks work everywhere. Running headers and page numbers work only in Chrome.** `@page` `size` and margins work in Chrome, Firefox 95+ and Safari 18.2+. Margin boxes, which are the only CSS way to put a page number on the page, shipped only in Chrome 131+ ([BCD][bcd]; [Chrome 131][cr-131]).
- **The dark theme does not reach paper by default.** Backgrounds drop out unless the user ticks "Background graphics" or the CSS sets `print-color-adjust: exact` ([Blink source][blink-bg]). Chrome and Safari never print the `<body>` background ([BCD][bcd]). `prefers-color-scheme` can still match `dark` while printing, so dark text colours can land on white paper ([MQ5][mq5]).
- **The fixed WebGPU canvas would print on every page if left visible,** because fixed boxes repeat in paged media ([CSS 2.2][css22-fixed]). The canvas's pixels are lost if print layout resets its `width`/`height` ([WebGPU][webgpu-resize]).
- **paged.js and Vivliostyle add the missing GCPM features** (running headers, page counters, footnotes, cross-references) by laying out pages in the DOM. They then print through the browser, so `@page size` support still decides the paper size ([paged.js docs][pjs-w3c]). **`page.pdf()` exists only in headless Chromium** in Playwright ([source][pw-guard]). Its header and footer come from separate templates, not from page CSS ([Playwright docs][pw-pdf]).

## 1. Browser print with CSS Paged Media

### Support by engine

| Feature | Chromium | Safari (macOS & iOS) | Firefox | Source |
| --- | --- | --- | --- | --- |
| `@page` rule | 2 | 18.2 | 19 | [BCD][bcd] |
| `@page` margin descriptors | yes (with `@page`) | 18.2 | yes (with `@page`) | [BCD][bcd]; [Safari 18.2][sf-182] |
| `@page { size }` (lengths, `A4`, `letter`) | 15 | 18.2 | 95 | [BCD][bcd] |
| `size: landscape \| portrait` | 15 | no | 95 | [BCD][bcd] |
| `page-orientation` | 85 | no | 122 | [BCD][bcd] |
| Margin boxes (`@top-center` and 15 others) | 131 | no | no | [BCD][bcd]; [Chrome 131][cr-131] |
| `counter(page)` / `counter(pages)` in margin boxes | 131 | no (no margin boxes) | no (no margin boxes) | [Chrome 131][cr-131] |
| Named pages (`page` property) | 85 | BCD says 1, unverified (see note) | 110 | [BCD][bcd] |
| `@page :first` | 18 | 6 | 116 | [BCD][bcd] |
| `@page :left` / `:right` | 6 | 5 | no | [BCD][bcd] |
| `break-before/after: page` | 50 | 10 | 65 | [BCD][bcd] |
| `break-before/after: avoid-page` | 50 | 10 | no | [BCD][bcd] |
| `break-inside: avoid` | 50 | 10 | 65 | [BCD][bcd] |
| `break-inside: avoid-page` | 50 | 10 | 92 | [BCD][bcd] |
| `orphans` / `widows` | 25 | 1.3 | no | [BCD][bcd] |
| `print-color-adjust` (unprefixed) | 136 | 15.4 | 97 | [BCD][bcd] |
| `-webkit-print-color-adjust` | 17 | 6 | — | [BCD][bcd] |
| `beforeprint` / `afterprint` | 63 | 13 | 6 | [BCD][bcd] |

Notes:

- **Safari's named pages are unverified.** BCD lists the `page` property from Safari 1, which is the version BCD records for long-parsed properties. WebKit has an open bug on the namespace of named pages in `@page` selectors ([WebKit 262007][wk-262007]). WPT does not run the print reftests in Safari, so no `page-name-*` test has a Safari result ([wpt.fyi][wpt-search]).
- **`break-*: avoid` is accepted but ignored in Safari and Firefox.** `CSS.supports()` returns true anyway, so feature detection gives the wrong answer ([BCD][bcd]; [Mozilla 1972340][moz-1972340]; [WebKit 294559][wk-294559]).
- **Margin boxes elsewhere:** Firefox's bug is open after 13 years ([Mozilla 856371][moz-856371]), and Mozilla has not published a standards position on it ([mozilla/standards-positions#921][moz-sp-921]). WebKit's position is "support" ([WebKit/standards-positions#275][wk-sp-275]), and its implementation bug is open ([WebKit 85062][wk-85062]).
- **WPT print reftests (stable, 2026-10-27), Chrome vs Firefox:** margin boxes 35/38 vs 0/38, `page-size` 17/17 vs 7/17, `page-margin` 7/7 vs 1/7, `page-name` reftests mostly pass in both, `fixedpos` 11/11 vs 7/11. Safari has no results for these, because the print reftests don't run there ([wpt.fyi][wpt-search]).

### Page counters and running headers

- The spec defines two page-based counters: `page` (the current page) and `pages` (the total) ([CSS Paged Media 3][css-page]). They are usable only inside margin boxes, so author-controlled page numbers work only in Chrome 131+ ([Chrome 131][cr-131]).
- Chrome still adds its own date, title, URL and page-number header and footer when the margins have room. The user can turn them off in the print dialog. They are suppressed when the page margins are 0, or too small to fit them. If the first page has no room for them, they are suppressed on later pages too ([Chrome blog][cr-blog]).
- Chrome does not yet support `string-set` (running headers taken from content), `target-counter()` or `float: footnote`. The Chrome blog lists them under future possibilities ([Chrome blog][cr-blog]).

### Backgrounds and colour

- **The user setting wins in the spec.** `print-color-adjust: exact` is a hint. "The user preference must be respected more strongly" than the hint ([CSS Color Adjust 1][css-color-adjust]).
- **In Chromium, `exact` overrides the "Background graphics" checkbox.** Blink paints a white background only when `print-color-adjust` is `economy` and the background setting is off ([Blink source][blink-bg]). That setting defaults to off ([Blink settings][blink-settings]).
- **Body backgrounds:** Chrome and Safari never print the `<body>` background. On `<body>`, `exact` applies only to its descendants ([BCD][bcd]). The WPT `body-background-*-print` tests fail in both Chrome and Firefox ([wpt.fyi][wpt-search]).
- **`prefers-color-scheme` while printing is up to the browser.** Media Queries 5 only notes that UAs "are expected to take such variances into consideration", such as a preference for light themes on paper ([MQ5][mq5]). The CSSWG declined to write a normative rule ([csswg-drafts#3522][csswg-3522]). A print stylesheet therefore has to set its own light colours and `color-scheme` explicitly.
- **Lazy images:** Safari does not load `loading="lazy"` images that were never scrolled into view, so they print empty ([WebKit 224547][wk-224547]). Chrome fixed the same bug in 2022 (linked from the WebKit bug).

## 2. Swapping in hidden content for print

### CSS only (`@media print`)

- The HTML spec tells browsers to run the same printing steps for `window.print()` and for any user request for a printed or PDF copy ([HTML printing steps][html-print]). Print media therefore applies whatever triggers the print.
- `[hidden]` maps to `display: none` in the UA stylesheet only ([HTML rendering][html-hidden]), so `@media print { [data-cv] { display: block } }` overrides it. Hiding the screen page with `display: none` in print removes it from the printed output.
- `matchMedia('print')` change listeners that re-lay out content pass in all three engines in WPT ([wpt.fyi][wpt-search]). Firefox fires them for user-initiated prints since version 105 ([Mozilla 774398][moz-774398]).

### `beforeprint` / `afterprint`

- **Timing:** The UA fires `beforeprint`, offers the print, then fires `afterprint`. It "must use the state of the relevant documents as they are at this point", meaning right after `beforeprint` ([HTML printing steps][html-print]). The UA may or may not block `print()` until the dialog closes (same source). DOM changes made after an `await` in the handler are not guaranteed to print.
- **WebKit ties the events to print layout, not to the dialog.** WebKit dispatches them from `WebPage::beginPrinting` and `WebPage::endPrinting` ([WebKit 196478 patch][wk-196478-patch]). On iOS 26.5, one `print()` call produced two `beforeprint`/`afterprint` cycles, each a few milliseconds long, while the print sheet was still open ([WebKit 316284][wk-316284]). So `afterprint` does not mean the user has finished.
- **iOS share-sheet print:** No primary source documents whether Share → Print fires the print events. It is an inference from the patch above that it does: WebKit fires the events from its shared print-layout entry points, and the share sheet presumably reaches the same code. This needs a test on a device.
- **iOS Home Screen web apps:** Since iOS 27.0, `window.print()` does nothing in a `display: standalone` web app: no print UI and no events. Apple tracks it as an issue outside WebKit ([WebKit 327504][wk-327504]).
- **Sandboxed iframes:** If the document's sandbox blocks modals, neither event fires ([HTML printing steps][html-print]). Chrome blocks `print()` in a sandboxed iframe without `allow-modals` ([BCD][bcd]).

## 3. Paged-media tools

| | paged.js | Vivliostyle | Playwright `page.pdf()` | Puppeteer `page.pdf()` |
| --- | --- | --- | --- | --- |
| What it is | In-browser polyfill that splits the DOM into page boxes ([README][pjs-readme]) | In-browser typesetter (core) plus a CLI that drives Playwright ([core features][viv-features]; [CLI README][viv-cli]) | Headless browser API that returns a PDF ([docs][pw-pdf]) | Same, for Chrome and Firefox ([docs][pptr-pdf]) |
| Engines | Docs recommend Chromium-family browsers, because they honour `@page size` ([docs][pjs-w3c]) | Chromium by default, Firefox optional ([CLI README][viv-cli]) | Headless Chromium only ([source][pw-guard]) | Chrome (CDP); Firefox via BiDi with fewer options ([BiDi][pptr-bidi]) |
| Margin boxes, `counter(page/pages)` | Yes, as DOM (`AtPage`, `Counters` handlers) ([source][pjs-src]) | Yes ([features][viv-features]) | Chrome's native support, plus `headerTemplate`/`footerTemplate` with `pageNumber`/`totalPages` ([docs][pw-pdf]) | Same as Playwright ([PDFOptions][pptr-opts]) |
| Running headers (`string-set`, `running()`) | Polyfilled (`StringSets`, `RunningHeaders` handlers) ([source][pjs-src]) | Yes ([features][viv-features]) | No (Chrome lacks them) | No |
| Footnotes, `target-counter()` | Polyfilled (`Footnotes`, `TargetCounters` handlers) ([source][pjs-src]) | Yes ([features][viv-features]) | No | No |
| Named pages, `:blank`, `:nth()` | Polyfilled (`AtPage` handler) ([source][pjs-src]) | Yes ([features][viv-features]) | Named pages via Chrome 85+ | Same |
| Bleed, crop marks | Polyfilled ([source][pjs-src]) | `bleed`, `marks`, PDF/X-1a output ([features][viv-features]; [CLI README][viv-cli]) | No | No |
| Licence, release | MIT; npm `latest` 0.4.3 (2023-07-06), `beta` 0.5.0-beta.2 (2024-10-04); GitHub repo still active ([npm][npm-pagedjs]; [GitHub][gh-pagedjs]) | AGPL-3.0; core 2.45.2 (2026-09-23), CLI 11.4.0 (2026-10-19) ([npm core][npm-viv-core]; [npm CLI][npm-viv]) | Apache-2.0; 1.64.1 (2026-10-14) ([npm][npm-pw]) | Apache-2.0; 25.16.0 (2026-10-22) ([npm][npm-pptr]) |

Details that matter for embedding:

- **paged.js replaces the page on screen.** By default the polyfill runs on DOM ready and replaces the document with paginated sheets. `PagedConfig.auto = false` defers it, and `Previewer.preview(content, css, renderTo)` renders into a chosen container ([README][pjs-readme]). For print it sets `@page { margin: 0 }`, `print-color-adjust: exact` on `html`, and `break-after: page` on each sheet. It then relies on the browser's `@page size` ([source][pjs-src]).
- **paged.js clones fixed elements onto every sheet.** It strips `position: fixed` from the stylesheet, removes the matching elements, and inserts an `absolute` copy into each page box ([source][pjs-src]). A fixed canvas would be cloned too, and a cloned `<canvas>` has no pixels.
- **Vivliostyle hands everything else to the browser.** It handles the paged-media CSS itself and leaves other CSS to the browser ([features][viv-features]).
- **`page.pdf()` uses print media and economy colours** unless the page sets `-webkit-print-color-adjust: exact` ([Playwright docs][pw-pdf]; [Puppeteer docs][pptr-pdf]). `printBackground` defaults to false. `preferCSSPageSize` defaults to false, which scales the page to the API's paper size instead of the CSS `@page size`. `headerTemplate`/`footerTemplate` don't run scripts and can't see page styles ([Playwright docs][pw-pdf]). `tagged` and `outline` add a tagged PDF and bookmarks (Playwright 1.42+) ([Playwright docs][pw-pdf]).
- **Cloudflare hosting:** Cloudflare Browser Run has a REST `/pdf` endpoint that takes Puppeteer-style `pdfOptions`, including `headerTemplate`, `printBackground` and `preferCSSPageSize` ([Cloudflare docs][cf-pdf]).

## 4. Gotchas for a fixed WebGPU canvas and a dark page

The canvas is `position: fixed` in `packages/atmosphere/src/ShaderCanvas.svelte`.

- **Fixed boxes repeat on every page** in paged media. Parts outside the initial containing block don't print ([CSS 2.2 §9.3.1, §9.6.1][css22-fixed]). A fixed canvas or overlay left visible in print appears on every page of the CV.
- **Resizing a WebGPU canvas clears it.** Setting the canvas `width` or `height`, even to the same value, replaces the drawing buffer with transparent black ([WebGPU][webgpu-resize]). Otherwise the drawing buffer keeps the last presented frame ([WebGPU][webgpu-buffer]). A resize handler triggered by print layout can therefore blank the canvas in print. Firefox alone has `mozPrintCallback` for drawing a canvas at print time ([BCD][bcd]).
- **Text colour:** with backgrounds removed, the light text of a dark theme prints light on white unless the print stylesheet resets colours. The reset has to be at least as specific as the dark-theme rules ([MQ5][mq5]; [csswg-drafts#3522][csswg-3522]).
- **Root background:** Chrome and Safari never print the `<body>` background ([BCD][bcd]). A dark page colour set on `html`/`body` does not reach paper either way.

## Sources

[bcd]: https://unpkg.com/@mdn/browser-compat-data@8.1.7/data.json
[wpt-runs]: https://wpt.fyi/api/runs?label=master&label=stable&max-count=1&product=chrome&product=firefox&product=safari
[wpt-search]: https://wpt.fyi/results/css/css-page?label=master&label=stable&product=chrome&product=firefox&product=safari
[css-page]: https://drafts.csswg.org/css-page-3/#page-based-counters
[css-color-adjust]: https://drafts.csswg.org/css-color-adjust-1/#print-color-adjust
[css22-fixed]: https://www.w3.org/TR/CSS22/visuren.html#fixed-positioning
[mq5]: https://drafts.csswg.org/mediaqueries-5/#prefers-color-scheme
[csswg-3522]: https://github.com/w3c/csswg-drafts/issues/3522
[html-print]: https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#printing
[html-hidden]: https://html.spec.whatwg.org/multipage/rendering.html#hidden-elements
[webgpu-resize]: https://www.w3.org/TR/webgpu/#abstract-opdef-update-the-canvas-size
[webgpu-buffer]: https://www.w3.org/TR/webgpu/#canvas-context
[cr-131]: https://developer.chrome.com/release-notes/131
[cr-blog]: https://developer.chrome.com/blog/print-margins
[sf-182]: https://webkit.org/blog/16301/webkit-features-in-safari-18-2/
[blink-bg]: https://github.com/chromium/chromium/blob/d5b9b480f8084673de05f7c2f92505b54f8dbb81/third_party/blink/renderer/core/paint/box_painter_base.cc#L567-L573
[blink-settings]: https://github.com/chromium/chromium/blob/d5b9b480f8084673de05f7c2f92505b54f8dbb81/third_party/blink/renderer/core/frame/settings.json5#L183-L184
[moz-856371]: https://bugzilla.mozilla.org/show_bug.cgi?id=856371
[moz-774398]: https://bugzilla.mozilla.org/show_bug.cgi?id=774398
[moz-1972340]: https://bugzilla.mozilla.org/show_bug.cgi?id=1972340
[moz-sp-921]: https://github.com/mozilla/standards-positions/issues/921
[wk-sp-275]: https://github.com/WebKit/standards-positions/issues/275
[wk-85062]: https://bugs.webkit.org/show_bug.cgi?id=85062
[wk-262007]: https://bugs.webkit.org/show_bug.cgi?id=262007
[wk-294559]: https://bugs.webkit.org/show_bug.cgi?id=294559
[wk-224547]: https://bugs.webkit.org/show_bug.cgi?id=224547
[wk-316284]: https://bugs.webkit.org/show_bug.cgi?id=316284
[wk-327504]: https://bugs.webkit.org/show_bug.cgi?id=327504
[wk-196478-patch]: https://bugs.webkit.org/attachment.cgi?id=366526
[pjs-readme]: https://unpkg.com/pagedjs@0.4.3/README.md
[pjs-src]: https://unpkg.com/pagedjs@0.4.3/dist/paged.polyfill.js
[pjs-w3c]: https://pagedjs.org/en/documentation/3-w3c-specifications-for-printing/
[gh-pagedjs]: https://github.com/pagedjs/pagedjs
[npm-pagedjs]: https://registry.npmjs.org/pagedjs
[viv-features]: https://github.com/vivliostyle/vivliostyle.js/blob/master/docs/supported-css-features.md
[viv-cli]: https://github.com/vivliostyle/vivliostyle-cli/blob/main/README.md
[npm-viv]: https://registry.npmjs.org/@vivliostyle/cli
[npm-viv-core]: https://registry.npmjs.org/@vivliostyle/core
[pw-pdf]: https://playwright.dev/docs/api/class-page#page-pdf
[pw-guard]: https://github.com/microsoft/playwright/blob/66070a1eaa0b869379607a9e0e1a652ddf2a77da/packages/playwright-core/src/server/dispatchers/pageDispatcher.ts#L336-L338
[npm-pw]: https://registry.npmjs.org/playwright
[pptr-pdf]: https://pptr.dev/api/puppeteer.page.pdf
[pptr-opts]: https://pptr.dev/api/puppeteer.pdfoptions
[pptr-bidi]: https://github.com/puppeteer/puppeteer/blob/a0b2b8dd0de163b9f0ac8fb78445f4158196a705/docs/webdriver-bidi.md
[npm-pptr]: https://registry.npmjs.org/puppeteer
[cf-pdf]: https://developers.cloudflare.com/browser-rendering/rest-api/pdf-endpoint/

- BCD: MDN browser-compat-data 8.1.7, `css.at-rules.page.*`, `css.properties.{page,break-*,orphans,widows,print-color-adjust}`, `css.selectors.{first,left,right}`, `api.Window.{beforeprint,afterprint}_event`, `api.Window.print`, `api.HTMLCanvasElement.mozPrintCallback` — <https://unpkg.com/@mdn/browser-compat-data@8.1.7/data.json>
- WPT: stable runs Chrome 156.0.8078.47, Firefox 158.0.1, Safari 27.0, `/css/css-page/` — <https://wpt.fyi/results/css/css-page>
- Specs: [CSS Paged Media 3][css-page], [CSS Color Adjust 1][css-color-adjust], [CSS 2.2 fixed positioning][css22-fixed], [Media Queries 5][mq5], [HTML printing][html-print], [HTML hidden elements][html-hidden], [WebGPU canvas][webgpu-buffer]
- Browser vendors: [Chrome 131 release notes][cr-131], [Chrome: print margins][cr-blog], [WebKit: Safari 18.2][sf-182], [Blink paint source][blink-bg], [Blink settings][blink-settings]
- Bug trackers: [Mozilla 856371][moz-856371], [774398][moz-774398], [1972340][moz-1972340]; [WebKit 85062][wk-85062], [262007][wk-262007], [294559][wk-294559], [224547][wk-224547], [316284][wk-316284], [327504][wk-327504], [196478 patch][wk-196478-patch]; standards positions [Mozilla #921][moz-sp-921], [WebKit #275][wk-sp-275]; [csswg-drafts#3522][csswg-3522]
- Tools: [paged.js README][pjs-readme], [paged.js source][pjs-src], [paged.js docs][pjs-w3c], [paged.js GitHub][gh-pagedjs]; [Vivliostyle supported CSS][viv-features], [Vivliostyle CLI][viv-cli]; [Playwright `page.pdf`][pw-pdf], [Playwright pdf guard][pw-guard]; [Puppeteer `page.pdf`][pptr-pdf], [PDFOptions][pptr-opts], [Puppeteer BiDi][pptr-bidi]; [Cloudflare `/pdf`][cf-pdf]
