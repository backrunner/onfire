---
title: Deploy to Cloudflare
description: Configure resources, build/runtime domains and ordered Worker releases.
order: 2
---

The application Worker serves both ToB and ToC and owns D1, cron and inbound
processing. The optional email agent transports allowlisted Cloudflare mail.
The documentation is a separate static Pages site. Two web hostnames are not two
application Workers.

## Resources and bindings

Use the current `wrangler.jsonc` and `workers/email-agent/wrangler.jsonc` templates
in your own account. Replace example domains, zero D1 ID and placeholder product
mapping. The example Vectorize index is 1024-dimensional cosine; choose a matching
embedding model/index before enabling knowledge.

| Resource / binding | Responsibility |
| --- | --- |
| D1 `DB` | Application business data and all migrations |
| R2 `R2` | Inline images and original knowledge documents |
| Vectorize `VECTORIZE` | Product/model knowledge coordinate spaces |
| R2 `EMAIL_STORAGE` | Shared private raw MIME and receipts |
| Inbound Queue / DLQ | Main consumes; ingress produces |
| Outbound Queue / DLQ | Main produces; optional agent consumes |
| `SEND_EMAIL` | Cloudflare Email Sending |
| `WORKER_SELF_REFERENCE` | Application background work |
| Agent `MAIN_MAIL` | Restricted main `MailAgentGateway` RPC |

Both queues/bucket bindings are in the main template even when you initially
use web tickets only. Each queue has one consumer and a DLQ. Set email R2 lifecycle
to 30 days and queue/DLQ retention to 14 days. The agent has no D1 or `AUTH_SECRET`.

## Domains and secrets

Attach distinct admin/customer Custom Domains. Set exact HTTPS `BETTER_AUTH_URL`,
comma-separated `ADMIN_DOMAINS`/`TOC_DOMAINS`, and matching `.env.production.local`
from `.env.production.example`. Build-time middleware values must agree with
runtime Wrangler variables; remove conflicting `.env.local` values. Keep
`workers_dev` disabled and development port routing/debug disabled in production.

Store a generated `AUTH_SECRET` with Wrangler. It seals saved credentials as well
as authenticating requests; preserve a recovery copy and plan rotation on an
existing database. Pair build-time `NEXT_PUBLIC_TURNSTILE_SITE_KEY` with runtime
`TURNSTILE_SECRET`. Both absent disables CAPTCHA intentionally; only the server
secret present makes protected customer actions fail closed.

## Validate, migrate and release

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm cf-typegen
pnpm cf-typegen --check
pnpm lint
pnpm test
pnpm build:worker
pnpm exec drizzle-kit check
pnpm exec wrangler deploy --dry-run
```

Back up an existing D1, confirm the target account/database, apply **all** migration
files, then deploy the built main Worker:

```sh
pnpm db:migrate:remote
pnpm exec wrangler deploy
```

Do not stop at historical migration `0028` or `0033`: the current checkout also
contains decision-filter migrations `0034` and `0035`. Protect the admin hostname
with Access before `/admin/install`, create the first administrator, then configure
product, team, agents, types and forms. [Customer identity](/docs/guides/customer-portal)
is required before portal access. `pnpm deploy` rebuilds/deploys main, not the agent.

## Optional email agent order

First deploy main with its RPC export and applied schema. Configure the product's
Cloudflare inbound/outbound addresses, `EMAIL_AGENT_ADDRESSES` in both configs,
agent `SEND_EMAIL.allowed_sender_addresses`, and main `EMAIL_AGENT_PRODUCTS` with
real product IDs. Rebuild/redeploy main after changing bindings/variables, then
`pnpm deploy:email-agent`. Point each allowed recipient's Email Routing rule at
one ingress Worker. Sender-domain Sending/Routing verification and DNS are separate
operator steps; a support subdomain can use Cloudflare MX while apex MX stays elsewhere.

## Static documentation site

`apps/site` is an independent workspace using svedocs 0.3.0 and SvelteKit 3.
Its canonical origin is `https://onfire.pwp.sh`. Pages settings are project root
`apps/site`, build `pnpm install --frozen-lockfile && pnpm build`, output `build`,
and `SITE_URL=https://onfire.pwp.sh`. English is `/` and `/docs/`; Chinese is
`/zh/` and `/docs/zh/...`. Local search, Markdown twins, llms.txt and sitemap are
static; site Ask AI is disabled. Pages publication does not deploy application Workers.

Use private ignored deployment configs for an existing instance; keep public
examples and secrets separate. Check [operations](/docs/guides/operations) and
[MCP Access exceptions](/docs/guides/automation) before opening a live instance.
