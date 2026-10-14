---
title: Ticket workflow
description: Numeric references, assignment, reply state, SLA and closure.
order: 3
---

## Numbers and identity

Customer-facing references are immutable positive numbers such as `#123`. D1
allocates them across the instance and never reuses a deleted number. Search
accepts `123` or `#123`. The UUID `id` still identifies API routes/relationships;
creation returns both UUID `ticketId` and numeric `ticketNumber`.

## Assignment

The customer selects a [product ticket type](/docs/guides/forms). Routing walks
up to the nearest configured ancestor team, then falls back to the tenant's
default team. Within the team, pending ticket count sorts ascending and agent
level descending. Administrators can be support agents too.

Acceptance/assignment starts processing. Reassignment requires the relevant
permission and an eligible active agent; ordinary agents can reassign within
their current team only when that team's policy allows it. Escalation looks
for a higher-level active agent in the current team.

## State transitions

| Action | Result |
| --- | --- |
| Accept a new ticket | `processing` |
| Public agent reply | `replied`, awaiting customer feedback |
| Customer reply to a replied ticket | `processing` |
| Escalate an open ticket | `escalated` |
| Manual or configured inactivity closure | `closed` |
| Reopen a closed ticket | `processing` |

A direct transition to `replied`, including bulk or MCP updates, requires an
existing public agent reply. Closed tickets reject customer replies; staff can
still add internal notes and reopen them. Closed tickets cannot be escalated
without reopening.

## SLA and inactivity

Configure accept and first-reply minutes separately for each priority. Accept
SLA starts at creation; unassigned tickets have no reply deadline. Assignment,
reassignment and escalation start/reset reply SLA. The first public agent reply
clears it; later customer replies do not revive a completed first-reply SLA.
Only deadlines valid for the current state count as overdue.

The five-minute cron sends a warning once within 30 minutes of a deadline, or
at breach if no warning was sent earlier. Product `autoCloseMinutes` closes
inactive tickets in `replied`; `null` disables auto-close. Cron scheduling means
closure is not guaranteed at the exact configured second.

## Replies and closure

Both surfaces use the shared rich-text editor. Replies store plain `content`
and sanitized `contentHtml`; Markdown is not the reply format. Inline images
are PNG/JPEG/GIF/WebP, verified by bytes, at most 5 MB each; SVG is rejected.
Public R2 image URLs are unguessable so email clients can load them. Internal
notes remain private and never invoke customer-facing translation.

Single/bulk closure and MCP closure default to notifying the customer. Set
`notifyCustomer: false` to omit only the customer's closure email; staff policies
and closure history still run. Stale concurrent closure requests emit no second
closure event. Automatic closure retains its normal notification behavior.

## Workspace controls

Sorting supports priority first, updated time in either direction and created
time in either direction, before pagination with numeric tie breakers. The URL
persists the choice. Changing sort resets page and bulk selection. Use top-search
suggestions to open a ticket directly; Enter opens the full search results.
