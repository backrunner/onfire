---
title: Customer portal integration
description: Issue customer identities safely and proxy the portal without CORS.
order: 12
---

## Choose an identity flow

Product keys issue customer JWTs; account keys manage ToB. They are not interchangeable.
A product key stays on the business server and authenticates `POST /api/toc/tokens`:

```json
{
  "apiKey": "<product-key>",
  "externalId": "business-user-123",
  "email": "customer@example.com",
  "level": 80
}
```

At least one of `email` or `externalId` is required; `level` is optional (0–100).
The normal `{ok,data}` response contains `token`, `customerId`, `productId` and
`expiresIn: 86400`. Use the customer token, not the product key, for customer APIs.
Stable product-scoped external IDs preserve history across verified email changes;
conflicting identities are rejected. External-ID-only customers are supported.

New product keys default to 90 days, at most 365 days. Rotation preserves expiry;
expiry can be shortened, not extended, and revocation is irreversible. Legacy
keys with null expiry remain compatible until explicitly constrained/revoked.
Expiring a key stops issuance, not already issued 24-hour customer tokens.

For a server-issued customer JWT, open the portal with the product ID in the
query and the token in the fragment:

```text
https://product.example.com/support?productId=prod-123#token=customer-jwt
```

The browser consumes and removes these fields before storing the session in
`sessionStorage`; in-app navigation reuses it. The legacy query-token form is
accepted but enters the initial HTTP request. Prefer fragments and never expose
the product key. Partial bootstrap links clear any previous product session.

## Browser bootstrap with Identity Resolver v1

Prefer an opaque, short-lived, product-bound credential for browser integrations:

```text
https://product.example.com/support?productId=prod-123#credential=opaque-value
```

The portal removes the fragment and exchanges it server-side. Configure the
product's public HTTPS resolver and sealed Bearer secret. OnFire sends:

```http
POST /configured/userinfo
Authorization: Bearer <configured-secret>
Content-Type: application/json
X-OnFire-Identity-Protocol: onfire-userinfo-v1

{"credential":"opaque-value","productId":"prod-123"}
```

Return `externalId` (required), optional `email`, integer `level` and `expiresAt`:

```json
{"externalId":"business-user-123","email":"customer@example.com","level":80}
```

Reject expired/consumed/product-mismatched credentials with 401/403. A preferably
single-use credential should expire within 60 seconds. Public HTTPS/DNS port 443,
no redirects, a five-second timeout and 64 KiB JSON response limit apply. Do not
put product keys, email or reusable credentials in the browser URL.

JWTs contain only routing claims `sub`, `productId`, `tenantId` plus standard JWT
metadata. Mutable email/external ID/level are loaded from D1 on every request.
Customer APIs never grant access to another customer's or product's ticket.

## Reverse proxy

Proxy `/support` and descendants **without stripping the prefix**. Preserve
method, query, body, status, response headers and streaming. Supported descendants
are customer pages, `/support/api/toc/*`, `/support/_next/*`, `sw.js` and `icon.svg`.
ToB paths below `/support` are denied. Do not cache portal HTML/customer APIs;
hashed static assets may use their upstream cache policy. Preserve security headers
and service-worker scope. A minimal nginx path is:

```nginx
location ^~ /support/ {
  proxy_pass https://support.example.com;
  proxy_set_header Host support.example.com;
  proxy_set_header X-Forwarded-Proto $scheme;
}
location = /support {
  proxy_pass https://support.example.com/support;
  proxy_set_header Host support.example.com;
}
```

Browser requests stay same-origin; unrelated-origin CORS is intentionally unsupported.

## Sessions and admission

Tokens last 24 hours. On 401 the portal clears the token but retains product ID
long enough to load safe return configuration. `portalReturnUrl` takes precedence
over `homepageUrl`; if neither exists, the portal returns to its root. Only HTTP(S)
return destinations are accepted.

Intake requires product-owned type/form IDs, form validation, configured rate limits
and Turnstile where enabled. The configured genuine-support filter runs before
web/API ticket/reply insertion; rejection returns 400 and unavailable verification
returns 503. Multi-language behavior is described in [languages](/docs/guides/languages).
