---
'@mia-cx/marker': patch
---

The highlight's copy of the page drops `anchor-name` and `view-transition-name`. A popover anchored to an element inside the marker stays visible once the highlight has drawn, and view transitions keep using the page's own elements.
