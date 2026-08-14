# MCP OAuth Integration

## Overview

OnFire exposes one remote, stateless Streamable HTTP MCP resource on the ToB
origin:

```text
https://onfire.alkinum.com/mcp
```

Clients authenticate with OAuth 2.1 authorization code flow and PKCE S256. No
API key or OAuth client secret is copied into the client. A standard MCP client
should need only the remote MCP URL; the initial `401` response and discovery
documents identify the authorization server and supported scopes.

The OAuth scopes are deliberately broad protocol capabilities:

- `onfire:mcp` permits an access token to call the MCP resource.
- `offline_access` requests a rotating refresh token.

They do not grant ticket or settings authority by themselves. The signed-in
OnFire user chooses atomic permissions and business resources on the ToB
consent page. `offline_access` is an authorization-server request scope, not a
protected-resource scope; resource metadata and bearer challenges advertise
only `onfire:mcp`.

## Discovery And Endpoints

All endpoints use the canonical `BETTER_AUTH_URL` origin.
Authorization-server metadata ignores provider-supplied endpoint URLs and
derives its issuer, authorization, token, registration, and revocation URLs
from this canonical origin. Invalid canonical configuration, malformed
provider metadata, and provider metadata failures return a non-cacheable 503.

| Purpose | Endpoint |
|---|---|
| MCP resource | `POST /mcp` |
| Protected-resource metadata | `GET /.well-known/oauth-protected-resource/mcp` |
| Authorization-server metadata | `GET /.well-known/oauth-authorization-server/api/tob/auth` |
| Authorization | `GET /api/tob/auth/oauth2/authorize` |
| Dynamic client registration | `POST /api/tob/auth/oauth2/register` |
| Token exchange/refresh | `POST /api/tob/auth/oauth2/token` |
| Token revocation | `POST /api/tob/auth/oauth2/revoke` |

The protected resource is the exact URL formed by appending `/mcp` to
`BETTER_AUTH_URL`. Authorization and token requests must contain that URL once
as the OAuth `resource` parameter. A trailing slash, query string, fragment,
credentials, different host, or duplicate resource is rejected.

Only public clients are advertised. Supported behavior is:

- response type `code` and response mode `query`;
- grants `authorization_code` and `refresh_token`;
- token and revocation authentication method `none`;
- PKCE method `S256`;
- scopes `onfire:mcp` and `offline_access`.

## Client Setup

For an MCP client with native remote-server OAuth support, configure the server
URL and let the client perform discovery:

```json
{
  "mcpServers": {
    "onfire": {
      "url": "https://onfire.alkinum.com/mcp"
    }
  }
}
```

The enclosing configuration key varies by client. The invariant is that the
transport is remote Streamable HTTP and the configured URL is the canonical
OnFire `/mcp` resource.

Clients implementing the flow directly should:

1. Read the protected-resource metadata and authorization-server metadata.
2. Register a public client with 1 to 20 exact callback URLs, the
   `authorization_code` grant, `code` response type, and `onfire:mcp`
   scope. Include `offline_access` when refresh is required. OnFire defaults
   omitted `token_endpoint_auth_method` and `application_type` values to
   `none` and `native`; web clients may explicitly use `application_type=web`
   with HTTPS callbacks. Every callback must use HTTPS or exact HTTP loopback
   host `localhost`, `127.0.0.1`, or `[::1]`. Private-use schemes,
   non-loopback HTTP, credentials, fragments, shortened/numeric loopback
   aliases, and other 127/8 addresses are rejected. If `resources` is supplied
   in registration metadata, it must contain only the exact canonical `/mcp`
   URL.
3. Generate a high-entropy PKCE verifier and its 43-character unpadded
   base64url SHA-256 challenge.
4. Open the authorization endpoint with `response_type=code`, `client_id`,
   exact `redirect_uri`, `scope=onfire:mcp offline_access`, `state`,
   `code_challenge`, `code_challenge_method=S256`, and the canonical
   `resource`.
5. After user consent, exchange the code using an
   `application/x-www-form-urlencoded` POST containing `grant_type`, `code`,
   `client_id`, `redirect_uri`, `code_verifier`, and the canonical `resource`.
6. Send the opaque access token as `Authorization: Bearer <token>` to `/mcp`.
   Refresh with the same client ID and canonical resource before expiry.
7. Revoke tokens at the revocation endpoint when disconnecting. Users can also
   revoke the entire application from their OnFire account page.

OAuth registration bodies are JSON; token and revocation bodies are form
encoded. OnFire rejects incorrect methods or media types and bodies larger than
64 KiB before the OAuth provider processes them. Persisted client metadata is
revalidated whenever a client authorizes, exchanges or revokes a token, loads
consent context, or presents a bearer token. Native HTTP loopback callbacks may
vary only the port; all other callbacks require exact registered-string
matching.

The OnFire consent API verifies the provider signature and independently
revalidates the signed request's parameter cardinality, public parameter set,
callback scheme, `code`/query response, exact MCP resource, supported unique
scopes, and PKCE S256 challenge. Login completion follows only a same-origin
OnFire continuation; unsafe URLs returned to password, Passkey, or two-factor
flows fall back to `/admin`.

The MCP authorization specification recommends Client ID Metadata Documents
(CIMD) when possible and permits dynamic registration as a fallback. OnFire
currently keeps DCR because a secure CIMD fetch requires resolving DNS once,
rejecting special-use addresses, pinning that approved address for the actual
connection, and refusing redirects. Standard Workers `fetch` cannot guarantee
connection pinning, so enabling CIMD would leave a DNS-rebinding SSRF boundary.

## Authorization Model

Effective access is evaluated for every MCP request:

```text
stored atomic grant
  intersection live role permissions
  intersection live tenant/product/team scope
  intersection delegated tenant/product resources
```

This means removing a role permission, product assignment, or team membership
narrows an existing token immediately. UI visibility is never used as an
authorization boundary.

Tool registration is only the first permission boundary. Every ticket and
settings operation requires its own atomic permission before reading the
database. Agent reassignment additionally joins the current `agent_teams` row
to the current team's `allowReassign` policy immediately before the mutation.

Resource choices have these semantics:

- **All accessible resources** follows everything the current role can access,
  now and later.
- **Selected tenant** covers products in that tenant only while the user can
  access them. It also covers products the user later gains within that tenant.
- **Selected product** covers only that product.
- Tenant and product selections form a union. Redundant product selections
  beneath a selected tenant are normalized away.

"Full access" on the consent page means every MCP capability the user's role
can grant within the selected resources. It does not elevate the user or expose
unimplemented OnFire administrative domains.

## Atomic Permissions And Tools

| Permission | Required live RBAC | Exposed tools |
|---|---|---|
| `tickets:read` | `ticket.read` | `list_tickets`, `get_ticket` |
| `tickets:reply` | `ticket.write` | `reply_to_ticket` |
| `tickets:update_status` | `ticket.write` | `update_ticket_status` |
| `tickets:update_priority` | `ticket.write` | `update_ticket_priority` |
| `tickets:assign` | `ticket.assign` | `list_ticket_agents`, `assign_ticket` |
| `tickets:reassign` | `ticket.reassign` | `list_ticket_agents`, `reassign_ticket` |
| `tickets:escalate` | `ticket.escalate` | `escalate_ticket` |
| `tickets:close` | `ticket.close` | `close_ticket` |
| `settings:read` | `product.settings` | `list_products`, `get_product_settings` |
| `settings:write` | `product.settings` | `update_product_settings` |

`list_ticket_agents` is exposed when either assignment permission is effective.
Product settings include the display name, customer-return URLs, SLA minutes,
auto-close timeout, team IDs, and identity-configuration status. Identity
secrets, API keys, email credentials, AI credentials, and notification endpoint
secrets are never returned or writable through MCP.

Ticket tools use the same visibility predicates, workflow transitions, SLA
updates, allocation rules, history, and notification events as ToB APIs. Close
is marked destructive in MCP tool annotations; all read tools are marked read
only.

## Reauthorization And Revocation

One active application grant exists per OnFire user and OAuth client.
Reauthorizing replaces it. Before replacement, OnFire deletes all earlier
access and refresh tokens for that user/client in the same D1 batch, preventing
an old token from inheriting newly broadened authority. Each authorization code
and the access/refresh family it creates is also bound to that exact grant
version; unbound codes and stale families fail closed at token exchange and MCP
authentication.

Every interactive authorization request returns to the OnFire consent page,
even when existing OAuth protocol consent already covers the requested scopes
and resource. This lets a user revise atomic permissions or tenant/product
selection during reconnection. OAuth `prompt=none` remains non-interactive and
is never changed into a consent prompt. The consent page displays the validated
callback hostname. A loopback callback also shows a local-device warning so the
user can verify that they initiated the connection from the named client.

The account page's Connected applications section shows the currently
effective permission count, resource summary, and last-use time. Revocation
deletes access tokens, refresh tokens, and OAuth consent, then marks the grant
revoked in one batch. A later connection must show consent again.

Signing out of the browser removes the Better Auth session but does not revoke
an OAuth delegation. This allows `offline_access` clients to refresh after the
interactive session ends. OnFire still loads the current application user and
recomputes live RBAC and resource scope for every MCP request, so deleting the
user or removing membership narrows or ends access immediately.

## MCP Request Contract

`/mcp` accepts stateless `POST` requests and returns JSON responses through the
Web Standard Streamable HTTP transport. Clients should send:

```http
Authorization: Bearer <access-token>
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2025-03-26
```

Request bodies are limited to 1 MiB and must use `application/json`. Before
rate limiting or bearer lookup, a present `Origin` header must exactly equal the
canonical ToB origin or the server returns HTTP 403 with a JSON-RPC error.
Missing `Origin` remains valid for native/non-browser clients. Each source IP is
then limited to 600 MCP requests per minute; each authenticated grant is limited
to 120 requests per minute. Both checks fail closed when D1 cannot count.
Unsupported `GET`, `HEAD`, `OPTIONS`, `PUT`, `PATCH`, and `DELETE` requests pass
the same Origin and authentication boundaries before returning `405`; session
termination is unnecessary because the server is stateless.

A missing or invalid bearer token returns `401` with `WWW-Authenticate`
pointing to the protected-resource metadata and requesting
`onfire:mcp` only.
Bearer acceptance rejects empty, duplicated, malformed, or unknown token scopes;
only `onfire:mcp` and optional `offline_access` are valid. Canonical URL
configuration is resolved before rate limiting or bearer lookup, including for
native requests without an `Origin` header.

OAuth authorize/token/register/revoke responses, MCP responses, consent-context
responses, and connected-application list/revocation responses always include
`Cache-Control: no-store` and `Pragma: no-cache`, including authentication and
validation failures.

## Cloudflare Access

The OAuth and MCP application authentication is sufficient for the exact
machine endpoints. If Cloudflare Access protects the entire ToB hostname, an
interactive Access response will prevent standard MCP clients from reading
discovery, registering, exchanging/refreshing tokens, revoking tokens, or
calling `/mcp`.

Before production rollout, create narrow path-level Access exceptions for:

```text
/.well-known/oauth-protected-resource*
/.well-known/oauth-authorization-server*
/api/tob/auth/oauth2/register
/api/tob/auth/oauth2/token
/api/tob/auth/oauth2/revoke
/mcp
```

The authorization endpoint may remain behind interactive Access because it is
opened in the user's browser. Keep `/admin/*`, `/api/tob/oauth/*`, and every
other `/api/tob/*` route under the existing Access policy. The Worker edge
guard independently keeps all MCP and OAuth discovery paths off ToC and unknown
hosts. The guard evaluates encoded, repeatedly decoded, and dot-segment
normalized path candidates so downstream URL normalization cannot change the
selected surface.

## Release Checklist

Migration `0017_careful_devos.sql` creates the complete Better Auth 1.7 OAuth
resource, client-resource, public-client, assertion, token, and consent schema,
plus `mcp_oauth_grants`. It also adds the Better Auth 1.7 `account.issuer`
contract, backfills existing credential accounts to `local:credential`, and
adds the account/session/verification lookup indexes used by the current
adapter. Apply it before deploying the MCP-enabled Worker. Do not deploy code
that references these tables before the migration is present.

Migration `0018_broad_la_nuit.sql` adds a version to each MCP application grant
and creates `mcp_oauth_authorizations`, which binds authorization-code and token
families to that version. Existing `0017` grants receive the `legacy` version
but no binding, so their earlier tokens fail closed and users must authorize the
client again after `0018` is deployed. Apply `0017` and then `0018` before the
matching Worker bundle.

After deployment, verify discovery, DCR, PKCE authorization, code exchange,
`tools/list`, one scoped read, refresh rotation, account-side revocation, and an
old-token `401`. Also verify that ToC hosts return `404` for `/mcp` and OAuth
discovery.
