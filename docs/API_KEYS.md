# Account API keys and AI automation

Account keys enable scoped server-to-server management of an OnFire account through
existing `/api/tob` APIs. Create them in **Account → Account API keys**. They are
separate from the product keys used to bootstrap customer portal sessions.

| Credential | Surface | Authority | Lifetime |
| --- | --- | --- | --- |
| Account API key (`ofk_<id>.<secret>`) | ToB `/api/tob` operation allowlist | Explicit operations ∩ live account RBAC ∩ live tenant/product/team scope ∩ selected products (if configured) | Required future expiry, at most 365 days at creation; no refresh |
| Product API key (`<id>.<secret>`) | `POST /api/toc/tokens` | Issue customer identities within one product | New keys default to 90 days, maximum 365 days; legacy null expiry preserved |
| MCP OAuth access token | Canonical ToB `/mcp` | Separate atomic OAuth grant and selected resources | OAuth expiry/refresh/revocation contract |
| Browser session | Dashboard and session-only security APIs | Live account role and scope | Better Auth session policy |

Use `Authorization: Bearer <account-key>` against the canonical ToB origin. An
explicit Authorization header never falls back to a browser cookie. Product keys,
customer JWTs and MCP tokens are not accepted as account REST credentials.

## Permissions and resources

Each operation has an explicit stable grant ID and an exact HTTP method/route.
Reads, creates, updates, deletes and special actions are individually selectable.
A read-only preset selects only GET operations. New operations do not inherit an
existing key's authority. Unknown routes, path encodings and route-pattern aliases
are denied; static actions cannot borrow a dynamic record permission.

Supported domains cover ticket reads and actions, products, types and immutable
forms, routing and presets, internal states, customers, tenants, users, teams and
agents, email settings/templates/logs/quarantine, notification policies and personal
endpoints, AI credentials/models/routes/usage, knowledge/documents, and product keys.
Interactive streaming AI assistants, login/password/Passkey/TOTP, preview identity,
OAuth grant administration and account-key management are outside this allowlist.
Document storage does not imply automatic extraction/indexing support.

Public reply (`reply_ticket`) and internal note (`add_ticket_note`) are independent
permissions, checked after parsing the shared route's body. Initial assignment and
reassignment are also independent. Bulk assignment additionally requires
`reassign_ticket` for already assigned tickets.
Reopening through either status endpoint additionally requires `reopen_ticket`.
Existing state transitions, agent checks, SLA, translation, history and notifications
remain in the normal API handlers.

Assignment, status changes and public replies compare the loaded ticket state
inside their write transaction; stale requests cannot bypass branch permissions
or resurrect a concurrently closed ticket. A conflict writes no reply, history or
mail intent. Reload current state before retrying.

Choose either all resources the owner can currently access or an explicit list of
products. Selected-product keys support product/ticket operations and scoped lookups;
tenant/system management, shared staff, AI administration scopes and personal endpoints
require account resource mode. The account's own RBAC still restricts that mode.
SuperAdmin keys also obey selected products. Role changes, team membership loss,
product reassignment and account removal apply on the next request.

User/role administration, product keys, credential changes and webhook/notification
configuration can establish other access or redirect future communications. Grant
those operations only when the automation is intended to administer them.

## Discovery and management

`GET /api/tob/api-key` requires a valid account key and returns safe key metadata,
owner ID/role and the currently effective operation list. Each operation includes
`id`, `method`, `path`, `description`, `productScoped`, and an `inputSchema`. Multipart
operations additionally declare `contentType` and `fileField`. Path parameters are
top-level input fields; query and JSON/form fields use `query` and `body` objects.
The bundled skill discovers these contracts at runtime instead of maintaining a
second API schema catalogue.

Account-key management requires the owner's browser session:

- `GET /api/tob/api-keys`: own keys, available operations and selectable products.
- `POST /api/tob/api-keys`: `{name, permissions, resourceMode, productIds, expiresAt}`;
  `resourceMode` is `all` (empty productIds) or `products` (at least one product).
  Returns a plaintext `apiKey` once with HTTP 201.
- `PATCH /api/tob/api-keys/:id`: replace the same configuration fields. Existing
  lifetime may only be shortened. Expired/revoked keys cannot be changed.
- `DELETE /api/tob/api-keys/:id`: immediately and irreversibly revoke an owned key.

Browser writes require the canonical ToB Origin. Preview sessions and bearer keys
cannot list, create, edit or revoke account keys. Rotation means creating a new key,
updating the consumer, then revoking the old key. Browser logout leaves keys valid.
Secrets have 256 random bits; only SHA-256 hashes are stored. Reads never return
hashes or saved plaintext. Management, bearer and discovery responses are no-store,
including errors. Usage records the latest authorized request time. Ticket writes
keep their existing actor history; this does not introduce a general API audit log.
Authorization rechecks the verified key configuration immediately before entering
the handler. Concurrent edits cannot restore revoked grants or lengthen a shortened
expiry; conflicting edits return 409. Revocation blocks subsequent authorization
decisions, but does not cancel an operation already authorized and in progress.

Bearer traffic has atomic, fail-closed D1 limits (300 requests/IP/minute and
120/key/minute). Key creation is limited to 20/hour/account. Rate-limit errors carry
`Retry-After`. Missing Origin is allowed for native clients; any present Origin must
match the canonical ToB origin. These controls do not expand the Worker host boundary.

## Product-key compatibility

Migration `0030_account_api_keys.sql` adds nullable `product_keys.expires_at`, leaving
legacy keys unchanged. Administrators can set a future expiry on an old key or revoke
it. Newly created product keys always have an expiry; rotate preserves it, expired
keys cannot rotate, and revoke cannot be undone. The UI no longer offers restoration.
Existing non-null expiry may be shortened, never extended. An expired product key
cannot issue further JWTs; already issued customer JWTs retain their 24-hour lifetime.

## Use the skill

The portable source is [.agents/skills/onfire-api](../.agents/skills/onfire-api/SKILL.md).
Copy its complete folder into the target agent's skill directory. The entrypoint,
workflow references and Python 3 client have no third-party runtime dependency.
Provision `ONFIRE_BASE_URL` and `ONFIRE_API_KEY` through the agent's secret environment.
Run the bundled client's `context`, `operations`, and `call` commands as documented
in the skill. It refuses redirects, checks live grants, supports multipart uploads,
redacts secret fields on stdout and can create private one-time-secret result files.

If Cloudflare Access protects ToB, also authorize the machine via an appropriate
Access service-token policy. The client accepts `CF_ACCESS_CLIENT_ID` and
`CF_ACCESS_CLIENT_SECRET`. Do not broadly bypass Access or send the OnFire key to an
interactive login redirect. A successful build or local test does not verify the
production Access policy.

Apply migration `0030` before deploying the matching Worker. No new Worker binding
or application secret is required. This feature's development does not itself
apply remote migrations, create production keys or deploy the Worker.
