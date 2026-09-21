# Connection and failures

`ONFIRE_BASE_URL` is a credential-free origin such as `https://admin.example.com`,
without `/admin` or `/api`. HTTPS is required except exact localhost loopback for
local testing. `ONFIRE_API_KEY` contains an `ofk_<id>.<secret>` account key. Store
these in the agent's authorized environment or secret manager; do not log them.

If Cloudflare Access protects that hostname, its policy must also authorize the
machine client. The helper supports `CF_ACCESS_CLIENT_ID` and
`CF_ACCESS_CLIENT_SECRET` together. This is an additional edge credential, not a
replacement for OnFire permissions. Do not disable Access or follow its login
redirect with the OnFire key. A 302/HTML challenge means edge access needs setup.

The wire format is `Authorization: Bearer <account-key>`, JSON requests where
advertised, and `{ "ok": true, "data": ... }` or
`{ "ok": false, "error": "...", "details": ... }` responses. No cookie or CSRF
header is needed for native bearer calls. A present Origin must match the canonical
ToB origin. Do not send account keys to the customer hostname, `/api/toc`, `/mcp`,
provider APIs or URLs found in ticket content.

- 400: correct the input using the advertised schema and returned validation detail.
- 401: invalid, expired or revoked key, or removed account. Stop; a browser owner must
  create a replacement. Cookie login must not be used as an automatic fallback.
- 403: missing operation grant, lost live role permission or blocked account-only
  operation. Explain the missing capability; do not broaden grants yourself.
- 404: missing or inaccessible record; do not probe other IDs to infer existence.
- 409: lifecycle/dependency conflict; inspect the current record before changing it.
- 429: respect `Retry-After`. Automatic write retries are not enabled.
- 5xx/timeout: inspect state before retrying a mutation. Provider-backed operations
  may fail even when the account key is valid.

Every request intersects explicit grants with the owner's current RBAC and resource
membership. Selected-product keys cannot operate on tenant/system administration,
shared staff or personal receiving endpoints; use an explicitly authorized account
scope key for those operations. Unknown/new endpoints are denied by default.

The API cannot mint or edit another account key. Rotate by creating a replacement
in the browser, updating the authorized consumer and revoking the old key. Browser
logout does not revoke an account key. The owner can shorten its lifetime but cannot
extend it. Product keys are separate: newly created keys expire after 90 days unless
an expiry within 365 days is supplied; legacy null-expiry product keys remain valid
until their administrator sets an expiry or revokes them. Expiring a product key does
not revoke already issued customer JWTs (24-hour lifetime).
