---
title: Quick start
description: Start a local OnFire workspace with local D1 data.
order: 1
---

## Requirements

- Node.js 22 or later
- pnpm 12.3.4
- A local Cloudflare Wrangler environment

## Install and seed

```sh
git clone https://github.com/backrunner/onfire.git
cd onfire
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
cp .env.example .env.local
openssl rand -base64 48
```

Put the generated value in `.dev.vars` as `AUTH_SECRET`. Then initialize local D1:

```sh
pnpm db:migrate:local
pnpm db:seed
pnpm db:seed:tickets
```

Start the admin server first, then the customer server in a second terminal:

```sh
pnpm dev:tob       # http://localhost:3001
pnpm dev:toc       # http://localhost:3000
```

The demo dashboard login is `admin@local.onfire` / `admin`. `pnpm db:reset` deletes local D1 data before recreating the demo. Never use demo credentials in production.

## Verify the setup

```sh
pnpm cf-typegen --check
pnpm lint
pnpm test
pnpm build:worker
```

Vectorize, external AI providers, Cloudflare Email, and notification services need a deployed or separately configured environment.
