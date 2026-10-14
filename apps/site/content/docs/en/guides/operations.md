---
title: Operations and recovery
description: Check releases, inspect delivery state and preserve recoverable data.
order: 15
---

## Before changing an installation

Record deployed Worker versions, bindings, application build variables and applied
D1 migrations. Back up D1 and retain a recovery point before migration. Use the
configuration belonging to your installation, not the public placeholder domains,
zero database ID or demo accounts. `AUTH_SECRET` also seals credentials; changing
it requires an encrypted-data rotation plan.

Run frozen install, generated bindings, TypeScript, tests, Worker build, Drizzle
metadata, fresh local migrations, dry-run, audit and startup profiling. Site
checks/builds are separate in `apps/site`. A local test or dry-run does not verify
remote Access, live email, physical client devices or real model quality.

## Scheduled and queued work

The application owns the five-minute cron for SLA warnings/breaches, auto-close,
mail repair, expired login buckets and AI usage retention. Configure queue/DLQ
consumers from the current Wrangler files. Queues are at-least-once; stable IDs,
claims and receipts provide application deduplication, not a global exactly-once
transaction across the mail provider, D1 and R2.

Monitor inbound/outbound logs, notification failures, AI credential health,
knowledge rebuild progress and queue dead letters. Email R2 objects/receipts
need a 30-day lifecycle and queues/DLQs a 14-day retention policy; these are
operator settings, not proof they were applied to an existing account.

## Delivery recovery

`queued` is accepted for processing, `sending` is an active claim, `sent` is
provider acceptance, `failed` is a known failure, and `uncertain` is an ambiguous
provider outcome. Uncertain messages block later delivery on their ticket.
Inspect `outbound_emails`, `email_dispatches`, R2 receipts and provider records
before resending. There is no dashboard resend control and no exactly-once
provider/D1 transaction. Never bulk-reset uncertain messages.

After repairing a known transient queue failure, replay the same validated job
body to its original queue; stable claims/receipts still govern deduplication.
If acceptance is confirmed, reconcile the original attempt/Message-ID. Only a
confirmed unsent attempt can be deliberately reset/requeued. Investigate before
receipts expire. Preserve DLQs rather than purging the evidence.

Quarantined intake is a separate manual release workflow. A new email needs an
explicit type, while a reply retains its ticket/type. Verification errors are not
proof of spam; held mail remains recoverable.

## Post-deployment checks and rollback

Check ToC health, denied cross-surface APIs, authenticated dashboard scope,
Turnstile pairing, customer identity/session return, cron, queues, threading and
real receiving endpoints. Inspect 429 `Retry-After`, 409 stale-state conflicts
and 503 unavailable verification without retrying non-idempotent writes blindly.

Keep additive migrations when reverting application code. If the main Worker is
rolled back, review its queue consumers/email routing and the agent's dependency
on the RPC export. An old bundle may not understand new configuration/data; do
not equate deploying an old version with a safe database rollback.
