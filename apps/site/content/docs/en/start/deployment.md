---
title: Deploy to Cloudflare
description: Provision the application and email Workers with your own resources.
order: 2
---

OnFire is designed for Cloudflare Workers. The public repository contains example domains and resource IDs; replace them before deploying.

## Provision resources

Create D1, R2, Queues, and a 1024-dimension cosine Vectorize index in your own account. Keep the application Worker as the sole owner of D1 and cron. The optional email Worker receives only a restricted named RPC service binding.

## Configure domains and secrets

Set one admin Custom Domain and one customer Custom Domain. `BETTER_AUTH_URL`, `ADMIN_DOMAINS`, `TOC_DOMAINS`, and the production Next.js environment must agree. Store `AUTH_SECRET` and the paired Turnstile secret with Wrangler; never commit them.

## Build and migrate

```sh
pnpm cf-typegen
pnpm cf-typegen --check
pnpm lint
pnpm test
pnpm build:worker
pnpm exec wrangler deploy --dry-run
pnpm db:migrate:remote
pnpm exec wrangler deploy
```

Create the first administrator at `/admin/install` behind Cloudflare Access. Configure products, teams, ticket types, forms, and email providers before opening the customer portal.

Read the complete [deployment guide](https://github.com/backrunner/onfire/blob/main/docs/DEPLOYMENT.md) for queues, email routing, MCP Access exceptions, and rollback considerations.
