---
title: Ticket workflow
description: Forms, routing, assignment, SLA, and replies share one state machine.
order: 3
---

Customers select a product-owned ticket type. OnFire resolves the nearest team route, falls back to the tenant default team, and assigns an available agent by pending workload and agent level.

## Immutable forms

Each ticket type owns one form series. Every save creates a new immutable version and makes it current. Existing tickets pin their type, form version, and type path, so later edits never rewrite history.

## Status and SLA

Tickets move from `new` to `processing`, `replied`, and `closed`; escalation is available at any point. Assignment starts the reply SLA, reassignment and escalation reset it, and the first public agent reply clears it. A later customer reply does not resurrect a completed first-reply deadline.

## Rich replies

Agent and customer replies use sanitized rich HTML with inline images stored in R2. Internal notes stay private and never invoke customer-facing translation. Moving a ticket to `replied` requires an existing public agent reply.
