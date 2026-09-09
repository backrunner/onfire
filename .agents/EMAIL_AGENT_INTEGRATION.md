# Subdomain email agent

An independent Email Worker can handle a product's support address while the
apex domain keeps its existing mail server. An Email Worker does not need an
HTTP Custom Domain: Cloudflare Email Routing selects its `email()` handler.
The subdomain needs its own MX, SPF, DKIM and sending verification.

## Delivery path

```text
Customer -> subdomain MX -> email agent -> R2 MIME + inbound Queue
                                             -> main Worker -> existing ticket pipeline
Public reply -> D1 reply + email intent -> D1 outbox -> outbound Queue
                                             -> email agent -> Cloudflare Email Sending
                                             -> R2 receipt -> main Worker acknowledgement
```

The main Worker remains the sole owner of D1, ticket logic and cron. Its existing
Email Routing handler uses the same inbound queue. Webhook and Stalwart inbound
paths retain their existing contracts. SMTP/API outbound providers remain on the
main Worker. Agent delivery applies only to Cloudflare senders explicitly listed
in `EMAIL_AGENT_ADDRESSES` and pinned to a product in `EMAIL_AGENT_PRODUCTS`.
The agent has no D1 binding or application secret; the `MailAgentGateway` named
RPC entrypoint exposes only outbound claim and completion.

## Wrangler configuration and deployment

Use the two checked-in Wrangler configurations as templates. Keep actual account,
domain, database and product IDs in ignored `wrangler.*.local.jsonc` files when
publishing the repository. The main and agent address lists must agree; the main
product map and agent `allowed_sender_addresses` must cover those exact addresses.
An agent can serve multiple configured subdomains within the account. Separate
agents need separate outbound queues/dispatch routing; do not attach competing
agents to the same queue or assume they receive only their own messages.

Required resources:

- Queues `onfire-email-inbound`, `onfire-email-outbound` and a DLQ for each.
  Each queue has one consumer. Main consumes inbound; agent consumes outbound.
  Both ingress Workers can produce inbound. Main produces outbound.
- R2 `onfire-email-storage`, shared by the two Workers, private, with a 30-day
  object lifecycle. Store MIME and receipts here; queue messages contain IDs only.
- `MAIN_MAIL` agent service binding to `onfire#MailAgentGateway`.
- `EMAIL_STORAGE`, `EMAIL_INBOUND_QUEUE`, `EMAIL_OUTBOUND_QUEUE` main bindings.
- Agent `SEND_EMAIL` with exact allowed sender addresses and Email Sending
  enabled for the subdomain. Arbitrary customer recipients require the applicable
  Cloudflare paid Sending plan and account sending quota.

Deployment order:

1. Create resources, set queue retention to 14 days and R2 lifecycle to 30 days.
2. Apply D1 migrations `0028_email_agent_outbox.sql` and
   `0029_email_notification_delivery.sql`.
3. Build and deploy main, then deploy the email agent. Main must export the named
   RPC entrypoint before the agent's service binding is deployed.
4. Enable Email Sending for the exact subdomain:
   `wrangler email sending enable <subdomain> --zone-id <zone-id>`.
5. Enable Email Routing **for the subdomain**, preserving apex MX. With Wrangler
   4.120.1 use the official `POST /zones/<zone-id>/email/routing/dns` API and body
   `{"name":"<subdomain>"}`; its routing-enable CLI does not select a subdomain.
6. Add an exact recipient rule via
   `wrangler email routing rules create <zone> --zone-id <zone-id> --name <label> --match-type literal --match-field to --match-value <address> --action-type worker --action-value onfire-email-agent`.
7. Configure that product's inbound and outbound provider as `cloudflare`, both
   addresses and Reply-To as the subdomain support address. Enable AI filtering
   only when its effective prescreening route is configured.
8. Check authoritative apex/subdomain MX, rule target, both deployed versions,
   queue consumers, and product configuration. Test real delivery with an
   authorized mailbox, then reply to verify threading and inbound ticket updates.

`pnpm cf-typegen --check` verifies both generated interfaces. `pnpm build:worker`
builds OpenNext and dry-runs the agent bundle. `pnpm deploy:email-agent` deploys
the agent using its default configuration; pass an explicit local configuration
with `pnpm exec wrangler deploy -c ...` for a private deployment.

## Reliability and operations

Cloudflare Queues delivers at least once and does not preserve order. Inbound
objects are keyed by envelope plus MIME SHA-256; missing Message-ID gets a stable
synthetic ID. Ticket ingestion uses the existing product-scoped deduplication.
The application accepts at most 10 MiB raw MIME. SMTP envelope addresses are
trusted instead of MIME display addresses; MIME is parsed once in the consumer.
A pending R2 marker lets cron recover interrupted inbound enqueue operations.

Public ToB/MCP agent replies commit a render intent with the reply. Rendering
commits the outbound email and dispatch together; a five-minute cron repairs
missing queue publication and unfinished reply intents. Other lifecycle emails
retain their existing trigger behavior, and become durable once written to the
outbox. One bad job is logged without preventing repair of subsequent jobs.

A D1 claim token elects one sending invocation. The agent persists a receipt in
R2 before acknowledging through RPC. A retried message replays that receipt and
does not send again. Actual Cloudflare Message-ID is recorded for threading;
later messages on the same ticket wait for earlier unresolved deliveries.
Replies and notification logs become sent only on confirmation. Here `sent`
means accepted by Email Sending, not proven delivered to the recipient's inbox.

Only documented pre-acceptance throttling errors retry automatically. Permanent
validation failures become `failed`. An ambiguous send exception or a missing
acknowledgement after 20 minutes becomes `uncertain`; do not automatically reset
it to queued. A late persisted receipt can still confirm the original attempt.
Uncertain delivery blocks later messages on that ticket until resolved.

Inspect `email_dispatches` (attempt token/count/times), `outbound_emails`
(status/error/provider Message-ID) and R2 `receipts/<id>/<token>.json` together
with provider logs. Main/agent structured logs report queue and repair failures.
Queue consumer retry limits send exhausted messages to the corresponding DLQ;
keep DLQs for investigation rather than purge them. After fixing a transient
failure, re-publish the same validated queue body to its original queue; existing
claims and receipts still enforce deduplication. Inbound raw objects use
`inbound/<sha256>.eml`, markers use `pending/<sha256>.json`.

There is no exactly-once transaction across Cloudflare Email Sending and D1/R2.
If acceptance succeeded but the receipt could not be stored, verify the provider
outcome before operator intervention. If confirmed accepted, reconcile using the
original attempt and actual Message-ID. If confirmed unsent, an operator may
reset that specific dispatch token/times and email status to queued, then
republish its ID. Never bulk-reset uncertain jobs. DLQ replay and ambiguous
outcome reconciliation currently require operator tooling; there is no dashboard
resend action. Raw objects and receipts expire after 30 days, so investigate
within that window. Rolling back the main Worker also requires reverting its
email routing/consumer plan; the agent depends on the new RPC export. Keep the
additive migrations when rolling application code back.

## References

- https://developers.cloudflare.com/email-service/configuration/subdomains/
- https://developers.cloudflare.com/api/resources/email_routing/subresources/dns/methods/create/
- https://developers.cloudflare.com/email-service/platform/pricing/
- https://developers.cloudflare.com/email-service/reference/headers/
- https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- https://developers.cloudflare.com/queues/platform/limits/
