# OnFire brand assets

`onfire-mark.svg` is the canonical OnFire mark: a continuous, softly curved flame
in warm white on a flat ember-orange tile. Keep its proportions, smooth contour,
and clear space when resizing it. The same colors work on light and dark backgrounds.

After editing the source, run from the repository root:

```sh
node scripts/sync-brand.mjs
node scripts/sync-brand.mjs --check
```

The script updates the Next.js favicon, the React `OnFireLogo` component, both
site icon files, and the marked logo region in `banner.svg`. Both READMEs use that
banner. The Svelte site's `BrandMark` component loads its generated SVG.

Use `OnFireLogo` in application screens instead of a generic icon or a separate
image. It renders inline SVG, so it also works beneath the customer portal's
`/support` reverse-proxy prefix. Logos beside visible OnFire text are decorative;
provide `label="OnFire"` when the mark supplies the brand name on its own.

The SVG artwork is part of OnFire's Apache-2.0-licensed source. The license does
not grant rights to OnFire trademarks.
