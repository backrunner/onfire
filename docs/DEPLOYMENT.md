# Deploying OnFire

The current source has two Workers: `onfire` serves both web surfaces and owns
business logic, while `onfire-email-agent` transports mail for explicitly allowed
Cloudflare sender addresses. This is independent of the two **web hostnames**:
the dashboard and portal still share one application Worker.

The examples below use `admin.example.com`, `support.example.com`, and
`support@example.com`. Replace them with your own values. Never deploy the local
demo database or its accounts.

## 1. Prepare Cloudflare resources

Use Node.js 22+ and the pnpm version pinned in `package.json`. Sign in to your own
Cloudflare account, then create the resources referenced by the Wrangler files:

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm exec wrangler d1 create onfire-d1
pnpm exec wrangler r2 bucket create onfire-storage
pnpm exec wrangler r2 bucket create onfire-email-storage
pnpm exec wrangler vectorize create onfire-knowledge --dimensions=1024 --metric=cosine
pnpm exec wrangler queues create onfire-email-inbound-dlq
pnpm exec wrangler queues create onfire-email-outbound-dlq
pnpm exec wrangler queues create onfire-email-inbound
pnpm exec wrangler queues create onfire-email-outbound
```

These commands create billable remote resources according to your Cloudflare
plan. `1024` is the example index dimension: select a compatible embedding model,
or create an index with its supported dimension before configuring knowledge.
See [embedding migration](../.agents/EMBEDDING_MIGRATION.md) before replacing an
index on an existing deployment.

| Binding | Owner | Purpose |
| --- | --- | --- |
| `DB` | Application | D1 business data and migrations |
| `R2` | Application | Inline images and uploaded knowledge documents |
| `VECTORIZE` | Application | Structured knowledge embeddings |
| `ASSETS` | Application | Generated OpenNext static assets |
| `WORKER_SELF_REFERENCE` | Application | Invoke background work in the application request context |
| `EMAIL_STORAGE` | Both | Raw inbound MIME and email transport records in a shared R2 bucket |
| `EMAIL_INBOUND_QUEUE` | Both produce; application consumes | Durable inbound processing |
| `EMAIL_OUTBOUND_QUEUE` | Application produces; email agent consumes | Cloudflare outbound transport |
| `SEND_EMAIL` | Both | Cloudflare Email Sending |
| `MAIN_MAIL` | Email agent | Main Worker's `MailAgentGateway` service entrypoint |

The queue/bucket bindings are part of the current application Worker even if you
initially use only web tickets. Both queues have a dead-letter queue. Monitor and
handle dead letters; configure email-object retention for your deployment.

## 2. Configure domains and bindings

Edit [`wrangler.jsonc`](../wrangler.jsonc) and
[`workers/email-agent/wrangler.jsonc`](../workers/email-agent/wrangler.jsonc):

1. Replace the zero D1 UUID with the ID returned by `d1 create`. Set `account_id`
   only if needed to select your own account.
2. Set `routes` to your admin and customer Custom Domains. Keep `workers_dev`
   disabled so it does not create another public entry point.
3. Set `BETTER_AUTH_URL` to the exact HTTPS admin origin. It defines the Better
   Auth origin, Passkey relying party, and canonical OAuth/MCP resource.
4. Set comma-separated `ADMIN_DOMAINS` and `TOC_DOMAINS` to the matching hostnames,
   without schemes or paths. Keep the two sets disjoint in production.
5. Match bucket, index, queue, and service names to your resources. If you rename
   `onfire`, also update `WORKER_SELF_REFERENCE.service` and `MAIN_MAIL.service`.

Next.js middleware is part of the build. Supply matching build-time values:

```sh
cp .env.production.example .env.production.local
```

Edit that file to match your Wrangler domains. Remove conflicting values from
`.env.local` or the build process environment: Next.js environment precedence
can otherwise retain a local development origin during a production build.
`NEXT_PUBLIC_PORT_ROUTING` and debug details should be false in production.

## 3. Set secrets

Generate a strong random `AUTH_SECRET` (for example `openssl rand -base64 48`)
and store it with Wrangler:

```sh
pnpm exec wrangler secret put AUTH_SECRET
```

On a first deployment, Wrangler may ask to create the named Worker to hold the
secret. Confirm the target account and Worker. Keep a secure copy: this key is
used for authentication, customer JWTs, internal tasks, and sealed credentials.
Replacing it on an existing database needs a rotation plan for encrypted data.

To enable Turnstile, put the real **public site key** in
`.env.production.local` as `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, and set its paired
server secret:

```sh
pnpm exec wrangler secret put TURNSTILE_SECRET
```

Leaving both unset disables CAPTCHA. Setting only the server secret causes
protected customer actions to fail closed. Development test keys are not
production protection. Provider credentials are managed separately in the
dashboard, not committed in environment examples.

The email agent deliberately has no `AUTH_SECRET` or D1 binding. It uses the
restricted `MAIN_MAIL` service binding.

## 4. Build, migrate, and deploy the application

```sh
pnpm cf-typegen
pnpm cf-typegen --check
pnpm lint
pnpm test
pnpm build:worker
pnpm exec wrangler deploy --dry-run
```

Generated types reflect your Wrangler values. Do not commit deployment-specific
generated types back to the upstream project. For a public pull request,
regenerate from the example configuration.

After checking the account and database, apply **all** migrations in the checkout
and deploy the already-built application:

```sh
pnpm db:migrate:remote
pnpm exec wrangler deploy
```

The mail transport work includes migrations `0028` and `0029`; older deployment
logs referring to `0027` do not describe the current source schema. Back up an
existing deployment before migrations. `pnpm deploy` also rebuilds before
deploying the application; it does **not** deploy the email agent.

Protect the admin hostname with Cloudflare Access before exposing the initial
setup. Visit `https://admin.example.com/admin/install`, create the administrator,
and configure a product and its ticket types/forms. Customer portal access needs
a product JWT or identity resolver; see the [integration guide](../.agents/TOC_INTEGRATION.md).

## 5. Configure and deploy email transport

For Cloudflare mail, onboard your sender domain in Cloudflare Email Sending and
configure Email Routing. In the dashboard, set the product's inbound address and
outbound provider/sender. Then update:

- `EMAIL_AGENT_ADDRESSES` in **both** Wrangler files with the same allowed addresses.
- `SEND_EMAIL.allowed_sender_addresses` in the email agent with those senders.
- `EMAIL_AGENT_PRODUCTS` in the main Worker with each normalized address mapped
  to the real product ID created in the previous step. The placeholder product
  ID must not remain when that address is enabled.

Regenerate types, rebuild, redeploy the main Worker, and deploy the agent:

```sh
pnpm cf-typegen
pnpm build:worker
pnpm exec wrangler deploy
pnpm deploy:email-agent
```

The main Worker must exist before the agent can bind to `MailAgentGateway`.
Route inbound mail for the allowlisted addresses to the email agent. The main
Worker also has an inbound handler for other product addresses; give each address
one delivery target to avoid duplicate routing.

Only Cloudflare outbound messages using an allowlisted sender use the agent
outbox. Other configured providers retain their own delivery adapters. Queue
acceptance is not delivery confirmation. Inspect outbound logs for `queued`,
`sending`, `sent`, `failed`, or `uncertain`; resolve uncertain delivery against
provider logs before resending. The main Worker's five-minute cron also repairs
outbox scheduling, scans SLA deadlines, and runs application maintenance.

Exercise a real inbound ticket, customer reply, agent response, notification,
thread association, and queue failure/recovery before relying on email delivery.
Local unit/integration tests mock provider transport.

## 6. Access, MCP, and operational checks

The Worker rejects ToB APIs on customer hosts and ToC APIs on admin hosts.
Cloudflare Access supplements application authentication and RBAC. Standard MCP
clients need narrow Access exceptions for discovery, registration, token,
revocation, and `/mcp`; leave interactive admin paths protected. Use the exact
path list in the [MCP guide](../.agents/MCP_INTEGRATION.md).

After deployment, verify:

- Customer `/api/toc/health` responds successfully; customer `/api/tob/health`
  is rejected. Unauthenticated customer ticket reads return 401.
- Admin login, Passkey/TOTP where enabled, and live resource scopes work.
- Turnstile-protected actions succeed with the configured site key and secret.
- Cron, queues, dead letters, email logs, and AI credential failures are observable.
- A `/support` integration loads prefixed assets and denies admin routes below
  that prefix. Follow the proxy guide without stripping the prefix upstream.

## Existing local deployment configuration

During the open-source preparation, the original operator configurations were
preserved in ignored files named `wrangler.production.local.jsonc` beside each
public Wrangler file. They exist only in that operator's workspace. Before
continuing an existing deployment, reconcile those files with current code and
use the matching build environment. The email agent can select its local copy
with `-c workers/email-agent/wrangler.production.local.jsonc`. The installed
OpenNext CLI supports selecting the application configuration directly:

```sh
pnpm exec opennextjs-cloudflare build --config wrangler.production.local.jsonc
pnpm exec wrangler deploy --dry-run --config wrangler.production.local.jsonc
pnpm exec wrangler deploy --config wrangler.production.local.jsonc
```

Set the matching production domain and Turnstile build variables described
above before building, and recheck the target before deploying. This keeps the
tracked example configuration intact. Do not commit the local copies or other
private configuration.
