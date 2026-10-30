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
