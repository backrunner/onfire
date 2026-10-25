# OnFire site

The public OnFire landing page and documentation site is a standalone SvelteKit
app powered by svedocs 0.3.0 and SvelteKit 3. It is intentionally separate from
the Next.js application so the marketing/docs surface can be deployed as a
static Cloudflare site without changing the ticket system runtime.

Use Node.js 22.17 or later and TypeScript 6.x. SvelteKit configuration now lives
in `vite.config.ts`, and local imports use the package's `#lib/*` mapping. The
framework and CLI are pinned together at 0.3.0. This release uses SvelteKit 3's
`$app/env` directly; the former environment-import compatibility alias is removed.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm check:content
pnpm licenses:inventory
pnpm build
pnpm preview
```

The default build uses the static adapter. Local search, markdown twins,
`llms.txt`, sitemap, and robots output are generated with the site. The API
search/Ask routes remain in the template for a future hosted provider; the
current site uses local search and does not enable Ask AI.

Set `SITE_URL` in `.env.local` or the deployment environment before publishing
so canonical links, sitemap entries, and alternate-language metadata use the
public origin. The default public origin is `https://onfire.pwp.sh` (see
`.env.example`). English is the default route; Chinese pages use `/zh` for the
landing page and `/docs/zh/...` for documentation.

For Cloudflare Pages, use `apps/site` as the project root, `pnpm build` as the
build command, and `build` as the output directory. Set `SITE_URL` to
`https://onfire.pwp.sh` in the production environment, then attach
`onfire.pwp.sh` as the Pages custom domain. The site is static and does not
need a Worker binding.

The landing preview uses local sample ticket data and supports switching tickets,
the customer portal, and routing views. It is not connected to a production
OnFire account.

## OnFire theme

The theme owns its navigation, sidebar, reading layout, footer, and CSS. It
imports only `svedocs/theme/base.css`; search, route loading, syntax highlighting,
code copy, table of contents, and theme state retain the svedocs behavior.

The visual system uses an opaque full-width header, an aligned 1280px shell,
continuous article surfaces, readable type, and restrained brand accents. The
homepage leads with product information and quickstart/integration links, then
an interactive sample and a plain guide directory. Avoid decorative hero art,
repeated promotional sections, numbered feature cards, and metadata dot chains.

- `src/lib/styles`: shared light/dark tokens, navigation, landing, workspace,
  reading, and dialog styles.
- `src/lib/theme`: typed svedocs component replacements registered in Vite.
- `src/lib/WorkspacePreview.svelte`: sample conversations and three working
  preview modes. These never call the production ticket APIs.
- `src/lib/messages.ts`: paired English/Chinese theme copy.
- `static/onfire-mark.svg`: the generated continuous-flame mark, used by
  `BrandMark.svelte`. Edit `../../docs/assets/onfire-mark.svg` and run
  `node scripts/sync-brand.mjs` from the repository root to update the site,
  application, favicons, and README banner together.

Geist and Geist Mono are bundled locally. Their SIL OFL notices and the Lucide
notice ship in `/licenses/`. Vite emits bundled dependency notices at
`/third-party-licenses.txt`.

The site owns an independent pnpm workspace and lockfile. Upgrade from this
folder with `pnpm exec svedocs upgrade <version> --package-manager pnpm`, then
review overrides and the generated lockfile. svedocs 0.3.0 already includes
Sharp 0.35.5, so the former Sharp override is removed. A global KaTeX 0.19.0
override also covers older math-plugin dependencies, and the targeted
`satori>fflate: 0.7.5` override fixes its pinned vulnerable 0.7.3 dependency.

The 2026-10-25 full and production dependency audits report no known
vulnerabilities. This supersedes the 2026-10-14 build-dependency findings.
Recheck both audits when upgrading upstream.

Run `pnpm licenses:inventory` after dependency changes. It records the site's
resolved dependencies in `dependency-licenses.json`, independently of the main
application inventory. The current inventory covers 264 packages on darwin-arm64
and has no unknown license metadata; other platforms can resolve different native
packages. This metadata check is not legal clearance.

## Documentation maintenance

The handbook has 16 documentation pages per language, plus two landing pages.
Both locales cover setup, deployment, ticket lifecycle, access, AI, genuine-support
filtering and its HTTP spec, forms, languages, notifications, security, email,
customer integration, account REST keys, MCP/WebMCP, and recovery.

[DOCUMENTATION_AUDIT.md](./DOCUMENTATION_AUDIT.md) maps each chapter to the source
contracts checked during this refresh. Update English and Chinese together and
run the strict translation/content check. Document stored uploads separately
from implemented indexing, and current source separately from production rollout.
Changes to customer intake must keep the spam/decision API spec and the dashboard
spec link aligned. The `spam-filter` document remains the canonical spec source.

Deploy a verified build from the repository root with the existing Wrangler login:

```sh
pnpm --dir apps/site install --frozen-lockfile
pnpm --dir apps/site check
pnpm --dir apps/site check:content
pnpm --dir apps/site build
cd apps/site
../../node_modules/.bin/wrangler pages deploy build --project-name onfire --branch main
```

Wrangler discovers the site-specific configuration from `apps/site`; Pages does
not accept a custom `--config` path. This keeps the Pages deployment separate
from the application and email Workers.
