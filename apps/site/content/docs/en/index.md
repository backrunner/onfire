---
title: OnFire handbook
description: Run, configure and integrate the current OnFire ticket system.
order: 0
---

OnFire runs a customer portal (ToC) and an internal support dashboard (ToB) in one
Cloudflare Worker. The optional email agent is a separate transport Worker. D1
stores business records, R2 stores images and source documents/raw mail, and
Vectorize indexes structured product knowledge.

## Install and operate

- [Quick start](/docs/start/quickstart): local D1, demo accounts and both web surfaces.
- [Deployment](/docs/start/deployment): resources, domains, secrets and Worker order.
- [Operations](/docs/guides/operations): release checks, logs, backups and recovery.

## Configure the workspace

- [Access and roles](/docs/guides/access): live scope, teams and support-agent membership.
- [Account security](/docs/guides/security): password, Passkey, TOTP and login protection.
- [Types and forms](/docs/guides/forms): routing trees, immutable versions and internal states.
- [Ticket workflow](/docs/guides/tickets): numbers, assignment, SLA, replies and closure.
- [Languages](/docs/guides/languages): product languages and stored translations.
- [Email](/docs/guides/email): inbound adapters, threading, templates and durable transport.
- [Notifications](/docs/guides/notifications): personal endpoints and inherited rules.
- [AI and knowledge](/docs/guides/ai): scoped credentials, task routes and knowledge rebuilding.
- [Spam filter specifications](/docs/guides/spam-filter): genuine-support policy and model/API contracts.

## Integrate

- [Customer portal](/docs/guides/customer-portal): product keys, identity resolver and `/support` proxy.
- [Account API keys](/docs/guides/account-api-keys): explicit REST operations and live discovery.
- [MCP and WebMCP](/docs/guides/automation): remote OAuth delegation and logged-in browser tools.

These pages describe the current source, including the pending decision-filter
changes. An existing installation needs the matching migrations and Worker build
before new behavior is available. Enabling an AI feature requires configured
credentials; uploading a source document does not automatically extract/index it.
