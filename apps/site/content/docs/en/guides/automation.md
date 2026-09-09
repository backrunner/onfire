---
title: Automation with MCP
description: Delegate selected ticket and settings actions with explicit OAuth grants.
order: 6
---

MCP runs at the canonical admin origin and uses OAuth 2.1 authorization code flow with PKCE S256. Users grant atomic permissions such as ticket reading, replying, assignment, escalation, closure, and settings access.

The effective grant is the intersection of the stored grant, live RBAC, current resource scope, and selected delegated tenants or products. Reauthorization invalidates earlier token families. Browser WebMCP tools use the current dashboard session and are invalidated on logout, expiry, identity change, or page departure.
