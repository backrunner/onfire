---
title: MCP and WebMCP
description: Choose remote OAuth delegation or authenticated dashboard browser tools.
order: 14
---

## Choose the surface

| Integration | Identity | Available work |
| --- | --- | --- |
| [Account REST key](/docs/guides/account-api-keys) | Explicit `ofk_` operation grants | Broad scoped management APIs with live input-schema discovery |
| Remote MCP | OAuth grant for the canonical ToB `/mcp` | Delegated ticket actions and product settings |
| Dashboard WebMCP | Current Better Auth browser session | Permission-filtered structured dashboard operations |

Product/customer credentials belong to ToC and cannot manage ToB. These three
management integrations do not inherit one another's grants.

## Remote MCP setup

Use the exact resource `https://admin.example.com/mcp` with a Streamable HTTP
client that supports OAuth 2.1 authorization code flow and PKCE S256. Configure
that URL; let discovery and interactive login/consent authorize the connection.
Do not copy a product key or an OAuth client secret into a public client.

| Purpose | Path on the canonical ToB origin |
| --- | --- |
| Protected resource metadata | `/.well-known/oauth-protected-resource/mcp` |
| Authorization server metadata | `/.well-known/oauth-authorization-server/api/tob/auth` |
| Authorization | `/api/tob/auth/oauth2/authorize` |
| Dynamic registration | `/api/tob/auth/oauth2/register` |
| Token / refresh | `/api/tob/auth/oauth2/token` |
| Revocation | `/api/tob/auth/oauth2/revoke` |

`onfire:mcp` is a protocol scope, not business authority. Optional `offline_access`
requests refresh tokens. Consent separately selects atomic permissions and all
accessible resources or a union of tenants/products. A selected tenant follows
products accessible within that tenant, including later gains; a selected product
covers that product only. Effective grants intersect live RBAC and resource scope.

Capabilities are `tickets:read`, `tickets:reply`, `tickets:update_status`,
`tickets:update_priority`, `tickets:assign`, `tickets:reassign`,
`tickets:escalate`, `tickets:close`, `settings:read`, `settings:write`.
Only effective tools are registered and operations recheck authority. Settings
expose scoped product configuration, not credential secrets or broad system admin.
Ticket writes retain normal SLA, translation, assignment, history and notifications.
Closure supports `notifyCustomer` and defaults to customer notification.

Callbacks require HTTPS or exact HTTP loopback hosts `localhost`, `127.0.0.1`,
`[::1]`. Only native loopback callbacks may vary registered port. Registration
uses JSON; token/revoke use form encoding. The OAuth `resource` is the canonical
MCP URL exactly, without a trailing slash or alternative host. Native requests
may omit Origin; any present Origin must exactly match ToB. Discovery, OAuth and
MCP responses are not cacheable. DCR is supported; CIMD remains disabled.

Reauthorization replaces the grant and invalidates previous access/refresh families.
Account-side revocation also removes consent. Interactive authorization revisits
fine-grained consent; browser logout does not revoke a delegation. Live membership
continues to apply to every subsequent request.

## Cloudflare Access

Keep interactive admin pages protected. Standard clients need narrow Access
exceptions for `/mcp`, both protected-resource metadata paths, authorization-server
metadata, and OAuth register/token/revoke. Do not exempt all `/api/tob/*` or the
interactive authorize endpoint. Machine REST keys can instead use an Access
service-token policy. Follow the exact operator path list in the
[repository integration reference](https://github.com/backrunner/onfire/blob/main/.agents/MCP_INTEGRATION.md).

## Dashboard WebMCP

Log in to ToB in a compatible browser and keep a Dashboard page open. OnFire
feature-detects `document.modelContext` and older `navigator.modelContext` APIs;
unsupported browsers keep the ordinary UI. Discovery filters by current
permissions, and every invocation verifies live identity before calling normal
scoped APIs. Preview exposes reads only.

Tool families cover ticket reads/actions, products, types/forms/versions, internal
states, staff/customers, email, notifications and scoped AI/knowledge. Start with
`onfire_get_context` and discover the current schemas. IDs are top-level fields;
filters/payloads use `query`/`body`. No arbitrary URL/method proxy is exposed.
Personal security, preview controls, OAuth grants, one-time credential flows,
binary uploads and streaming conversations retain their interactive interfaces.

Logout, expiry, identity change and page departure invalidate callbacks. Writes
refresh dashboard data without making a failed UI refresh retry the mutation.
Browser support and calling APIs vary; use your browser's current WebMCP integration,
not a fabricated polyfill or cross-origin bridge.
