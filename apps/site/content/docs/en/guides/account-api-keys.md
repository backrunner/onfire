---
title: Account API keys
description: Grant exact REST operations and discover current effective contracts.
order: 13
---

## Create and scope

Create an `ofk_` Bearer key in Account → Account API keys using the owner's real
browser session. Choose exact operation grants and either all currently accessible
resources or selected products. Expiry is mandatory, at most 365 days at creation.
The plaintext appears once; only its hash is stored. Editing may shorten expiry
or replace grants, never renew the same key. Rotation creates a new key, updates
the consumer and irrevocably revokes the old key.

Effective authority is the operation grant intersected with the owner's live RBAC,
resource scope and selected products. New/unknown endpoints are denied by default.
Selected-product mode supports product/ticket actions and scoped lookups; system,
tenant, shared-staff, AI administration and personal settings require account
resource mode, which still obeys the owner's role.

## Discover before calling

Call the canonical ToB origin with `Authorization: Bearer <account-key>`.
An explicit Authorization header never falls back to cookies. Product keys,
customer JWTs and MCP tokens are not account REST credentials.

```sh
curl --fail-with-body -H "Authorization: Bearer $ONFIRE_API_KEY" "$ONFIRE_BASE_URL/api/tob/api-key"
```

Discovery returns safe key/owner metadata and effective operations with `id`,
`method`, `path`, `description`, `productScoped` and `inputSchema`. Path IDs are
top-level parameters; filters and payloads use `query`/`body`. Multipart discovery
also declares the file field/content type. Prefer this live contract over a
copied endpoint list.

Public reply and internal note grants are distinct, as are assignment and
reassignment. Status-based reopening additionally needs the reopen grant; bulk
assignment needs reassignment authority for already assigned tickets. Use UUIDs
in API paths and numeric ticket numbers for display/search. Stale state mutations
return 409 without reply/history/mail side effects; reload before retrying.

## Management and boundaries

Only the owner's browser session can list/create/edit/revoke keys; preview and
bearer credentials cannot. Browser writes require the canonical ToB Origin.
Logout does not revoke keys. Live role/membership loss narrows future requests;
revocation cannot cancel an already authorized in-progress operation.

Limits are 300 requests/IP/minute, 120/key/minute and 20 key creations/account/hour.
Limiter failures reject access, 429 includes `Retry-After`, and credential responses
are non-cacheable. A present native-client Origin must match ToB; missing Origin
is allowed. Cloudflare Access may also require a machine service token.

Security enrollment, preview, OAuth administration, account-key management and
streaming assistant conversations are outside this REST operation allowlist.
The portable [OnFire API skill](https://github.com/backrunner/onfire/tree/main/.agents/skills/onfire-api)
uses live discovery and scoped keys. It is distinct from [OAuth MCP](/docs/guides/automation)
and [ToC product keys](/docs/guides/customer-portal).
