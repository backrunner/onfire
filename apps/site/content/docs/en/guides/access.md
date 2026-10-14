---
title: Access and roles
description: Separate role capabilities, live scope and support-agent membership.
order: 4
---

## Role scope

| Role | Administrative scope |
| --- | --- |
| SuperAdmin | Instance-wide system and tenant administration |
| TenantAdmin | Their tenant, its products, teams and permitted staff |
| ProductAdmin | Products assigned through `user_products` and product-owned teams |
| TeamAdmin | Their teams, tickets and scoped notification settings |
| Agent | Tickets visible through active team membership |

Roles do not bypass tenant integrity. Submitted tenant/product/team associations
must belong together even for SuperAdmin. Deleting a tenant/product/team with
dependent records returns 409 rather than removing linked data silently.

`product.manage` controls product creation/deletion. `product.settings` controls
configuration such as SLA, auto-close and team associations. ProductAdmin can
configure assigned products without gaining product lifecycle authority.
Ticket-type authoring is distinct from team-route configuration; TeamAdmin can
route visible types but cannot author type trees or forms.

## Where settings live

SuperAdmin's configuration landing is system administration. TenantAdmin is
sent to their tenant, without a global tenant list. ProductAdmin sees only assigned
products, without tenant tabs. TeamAdmin and Agent have no management entry.
Email, notification and AI/knowledge settings live within the relevant scope.
System AI scope is SuperAdmin-only; TenantAdmin can administer tenant AI scope,
and TenantAdmin/ProductAdmin can administer accessible product AI scope.

## Accounts and support agents

A system account supplies login identity and RBAC. Active support-agent status
and team membership separately determine eligibility to receive or reply to
tickets. Administrators may also become agents. Product administrators may attach
existing tenant users to product teams; they cannot change global agent level or
active state. System teams are SuperAdmin-only and outside tenant notification
inheritance.

## Read-only preview

SuperAdmin and TenantAdmin can preview a strictly lower-role user within scope.
The authenticated session remains the actor; APIs overlay the target's current
role and resource scope. Writes are blocked except entering/leaving preview,
and the sidebar retains an indicator. Account-key and security management stay
session-only; remote MCP delegation never inherits a preview identity.

UI visibility is presentation. Every API checks live role, ownership and target
scope. Role/membership loss narrows [account keys](/docs/guides/account-api-keys)
and [MCP grants](/docs/guides/automation) on their next authorization decision.
