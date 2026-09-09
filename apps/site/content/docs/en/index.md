---
title: OnFire handbook
description: Install, configure, integrate, and operate an OnFire workspace.
order: 0
---

OnFire is a modern ticket system with a customer portal, internal support dashboard, email workflows, AI assistance, and scoped automation.

## Start here

- [Quick start](/docs/start/quickstart): run the local demo in a few minutes.
- [Deployment](/docs/start/deployment): provision Cloudflare resources and deploy both Workers.
- [Ticket workflow](/docs/guides/tickets): understand forms, routing, assignment, and SLA.
- [Access and roles](/docs/guides/access): configure tenant, product, and team scope.
- [AI and knowledge](/docs/guides/ai): connect providers without putting credentials in the repository.
- [Automation](/docs/guides/automation): delegate work through MCP or use dashboard WebMCP tools.

## The shape of OnFire

The customer-facing portal is **ToC**. The internal management dashboard is **ToB**. Both surfaces run through one OpenNext Worker, while the optional email agent Worker handles queue-backed Cloudflare Email Sending for allowlisted addresses.

The application stores business records in D1, inline images and MIME in R2, and knowledge vectors in Vectorize. Permission checks combine role and live resource scope at every API boundary.
