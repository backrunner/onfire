---
title: Notifications
description: Configure personal destinations and inherited event policies.
order: 9
---

## Personal receiving endpoints

Every system user owns their receiving endpoints under Account. Supported channels
are email, PushDeer, Bark, ntfy, Telegram, Discord, Slack, Microsoft Teams, Feishu,
DingTalk and WeCom. Feishu/DingTalk support optional signed-robot secrets. Saved
credentials are encrypted and omitted from API responses; leaving an edit secret
blank preserves it.

A user starts with an enabled email endpoint using their account email. Backfill
adds one only when no email endpoint exists, preserving later enable/disable choices.
Products store policies, not personal addresses, device tokens or webhook secrets.

## Inheritance

Policies resolve **tenant → current ticket team → product** for the event product.
Unrelated associated teams are not merged. A child can override an inherited policy
as a whole, disable it locally, or add another policy. Deleting an override restores
inheritance; disabling masks the parent. A root with remaining overrides cannot
be deleted. System teams are outside this chain.

## Rules, requirements and events

Rules choose events, channel types and recipients: current assignee, current team,
all agents in scope, a specific team or a specific agent. Requirements make channel
types mandatory for selected events/recipients and directly participate in delivery.
Both resolve only the event product's currently active support agents. Overlap
is deduplicated by recipient endpoint. Missing selected/required channels become
failed notification logs rather than silent skips; compliance uses the same resolver.

Events are `ticket_created`, `ticket_assigned`, `ticket_reassigned`,
`ticket_escalated`, `ticket_expiring`, `customer_replied` and `ticket_closed`.
Manual silent closure skips only customer mail, not these staff policies.

## Configure and inspect

Tenant/product pages and scoped team pages contain policies and compliance.
Product previews can select a team to inspect the complete chain. TeamAdmin
manages only their teams; ProductAdmin manages assigned products and product teams.
All users manage only their own destinations. A saved endpoint test is personal;
email tests select a visible product so its outbound provider is used.

Email endpoints send through that product's email provider. A successful webhook
or provider acceptance does not prove a human received the message. Inspect
notification logs and the receiving service when diagnosing delivery.
