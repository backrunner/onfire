---
title: Quick start
description: Run the local demo and configure your first customer intake.
order: 1
---

## Requirements

Use Node.js `^22.17.0`, `^24.0.0`, or `>=26.0.0`, and the repository's pnpm
version (currently `12.3.4`). Wrangler runs local D1; no production database is
needed for the demo. `apps/site` is a separate pnpm workspace.

## Install and initialize

```sh
git clone https://github.com/backrunner/onfire.git
cd onfire
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
cp .env.example .env.local
openssl rand -base64 48
```

Put your generated secret in `.dev.vars` as `AUTH_SECRET`. Keep the local
`BETTER_AUTH_URL` and routing domains aligned between both files. Then run:

```sh
pnpm db:migrate:local
pnpm db:seed
pnpm db:seed:tickets
pnpm dev
```

`pnpm dev` runs ToC at `http://localhost:3000` and ToB at
`http://localhost:3001`. Alternatively use `pnpm dev:toc` and `pnpm dev:tob`
in separate terminals. The demo login is `admin@local.onfire` / `admin`.
`pnpm db:reset` deletes the local D1 state, migrates and reseeds it; use it only
when you intend to reset your local demo.

## First configuration

1. Sign in to the dashboard. Review the demo tenant, product and default team.
2. Create or inspect a product-owned ticket type and its active form version.
3. Assign active support agents to the routed team; an account role alone is
   not support-agent membership.
4. Use a product key or identity resolver to open the [customer portal](/docs/guides/customer-portal).
5. Configure optional email, AI and personal notification endpoints separately.

The portal requires a verified customer identity. The product API key must
stay on your server; it is not a browser application secret. External providers,
Vectorize and real Cloudflare mail need their own configured environment.

## Verify

```sh
pnpm cf-typegen --check
pnpm lint
pnpm test
pnpm build:worker
```

Local checks do not establish production email delivery or a remote Access policy.
Continue with [deployment](/docs/start/deployment) for a real instance.
