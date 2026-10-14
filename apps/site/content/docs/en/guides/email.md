---
title: Email intake and delivery
description: Configure product mail, threading, templates and the optional email agent.
order: 11
---

## Product settings

Inbound/outbound providers, sender, templates and mail logs live on each product's
configuration page. `/admin/email` redirects there rather than being a first-level
mail console. Outbound providers are Resend, SendGrid, Mailgun, Maileroo, SMTP and
Cloudflare Email. SMTP uses its configured server; API providers use their keys;
Cloudflare uses `SEND_EMAIL`, not a dashboard API key.

## Inbound and quarantine

Generic/provider webhooks, Stalwart and Cloudflare routing normalize incoming
mail into the same pipeline. Blank plain text falls back to sanitized HTML text.
Product/message deduplication, empty/upstream-spam checks, strict SPF/DKIM checks,
automated/list/bounce checks and sender limits run before external model work.
The configured [spam filter](/docs/guides/spam-filter) gates both new mail and
matched replies, holding rejection or verification failure for manual review.

Optional email AI prescreening is a separate function: it classifies support intent,
chooses a product type and stores insights for new mail. It needs an enabled
`prescreening` route. Invalid/low-confidence type choices use the hidden
`unclassified` fallback. This does not turn a malformed form into a valid submission.

Inbound subjects accept numeric and legacy UUID ticket markers, checking product
and current customer email. Validated `In-Reply-To`/`References` headers take
precedence. Outbound public replies preserve those headers across providers.
Maileroo uses its structured v2 send endpoint and records the provider's reference.
Non-image inbound attachments and `cid:` images are filtered out; do not rely on
email attachments as a document-upload path.

A quarantined new thread needs an explicit type when released; a matched reply
retains its original ticket type. Release records actor and reason. It does not
re-run a rejected filter and silently discard the operator's decision.

## Generic inbound webhook

`POST /api/toc/webhooks/inbound` on the ToC origin uses
a product's configured inbound address and webhook secret. Authenticate with
`Authorization: Bearer <secret>` or `X-Webhook-Signature: sha256=<hex>` over the
exact raw request body using HMAC-SHA256.

```json
{
  "from_email": "customer@example.com",
  "to_email": "support@example.com",
  "subject": "Cannot sign in",
  "body_plain": "My account is locked.",
  "message_id": "<message-id@example.com>"
}
```

`from_email`, `to_email` and `subject` are required; at least one of `body_plain`
or `body_html` is required. Optional fields include `from_name`, `spf_result`,
`dkim_result` and `is_spam`. Generate/rotate the secret in product email settings
or its `POST /api/tob/admin/email-config/:productId/webhook-secret` API.
Cloudflare-routed mail uses its Worker handler and needs no webhook secret.

## Templates

Types are `ticket_created`, `ticket_replied`, `ticket_closed`, `ticket_escalated`.
Variables are `ticket_id` (numeric number), `subject`, `customer_name`,
`customer_email`, `agent_name`, `reply_content`, `product_name`, written as
`{{ticket_id}}`. Missing overrides use system defaults. Preview and delivery use
the same renderer; scalar customer text is escaped and `reply_content` uses
already sanitized HTML. The sandboxed preview cannot execute scripts or make
external requests. The HTML editor supports formatting/minifying and inserts
variables at the cursor.

## Cloudflare email agent

Raw MIME/envelope is stored in private R2 and queued as a reference. The application
Worker consumes inbound jobs and owns D1/cron. An optional transport Worker
consumes outbound jobs through restricted `MailAgentGateway` RPC, with no D1 or
`AUTH_SECRET`. Only allowlisted senders mapped to exact products use this path.

Public agent replies commit mail-render intents with the reply; a durable outbox
and five-minute repair scan recover interrupted render/enqueue. Sending uses
atomic claims and persisted R2 receipts. `sent` means provider acceptance, not
inbox delivery. Ambiguous outcomes become `uncertain` and block later delivery
on the same ticket until reconciled; there is no dashboard resend action.

Apply all migrations and deploy main before the agent. Keep address allowlists,
product map and sender bindings aligned. See [deployment](/docs/start/deployment)
and [recovery](/docs/guides/operations) for queue/DLQ and receipt handling.
