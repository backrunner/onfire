# OnFire site

The public OnFire landing page and documentation site is a standalone SvelteKit
app powered by svedocs 0.2.1. It is intentionally separate from the Next.js
application so the marketing/docs surface can be deployed as a static Cloudflare
site without changing the ticket system runtime.

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
public origin. English is the default route; Chinese pages use `/zh` for the
landing page and `/docs/zh/...` for documentation.

The landing preview is intentionally static and uses sample ticket data. It is
not connected to a production OnFire account.
