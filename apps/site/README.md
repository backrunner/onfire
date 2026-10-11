# OnFire site

The public OnFire landing page and documentation site is a standalone SvelteKit
app powered by svedocs 0.2.3 and SvelteKit 3. It is intentionally separate from
the Next.js application so the marketing/docs surface can be deployed as a
static Cloudflare site without changing the ticket system runtime.

Use Node.js 22.17 or later and TypeScript 6.x. SvelteKit configuration now lives
in `vite.config.ts`, and local imports use the package's `#lib/*` mapping. The
Vite alias from `$app/environment` to `$app/env` keeps svedocs 0.2.3 compatible
with the renamed SvelteKit API; remove it once upstream adopts the new name.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm check:content
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

pnpm overrides keep svedocs on Sharp 0.35.5 and its math renderer on KaTeX 0.18.2
for published security fixes. Recheck `pnpm audit --prod` when upgrading upstream
and remove the overrides once its minimum versions include the fixes. The
2026-10-11 audit still reports upstream build dependencies `braces` (high) and
`sprintf-js` (moderate), for which no patched releases are available. This
static site does not run those build dependencies in a deployed server.

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
