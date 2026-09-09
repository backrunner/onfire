# ToC Reverse Proxy And Identity Integration

## Domain Deployment Modes

### Recommended: one Worker, two hostnames

The current OpenNext bundle can serve both surfaces from one Worker:

```text
admin.example.com   -> ToB pages and /api/tob/*
support.example.com   -> ToC pages and /api/toc/*
```

Attach both hostnames to the Worker, set `ADMIN_DOMAINS` and `TOC_DOMAINS` in
the deployment variables, and apply a Cloudflare Access self-hosted
application policy to `admin.example.com`. Access can require an identity,
device posture, or service token before the request reaches the Worker. The
Worker still enforces Better Auth and RBAC, and its edge guard rejects the
opposite API surface even if a path is guessed on the other hostname.

This mode shares the existing D1, R2, Vectorize, email binding, cron, and
deployment lifecycle. Better Auth cookies are host-only by default, while ToC
customer credentials are stored in the ToC origin's sessionStorage.
The production Wrangler config disables the fallback `workers.dev` hostname so
these two Custom Domains are the only public HTTP entry points.

### Optional: two independent Workers

This is a separate deployment unit, not just a DNS change. It requires two
Wrangler environments/Worker names, two OpenNext builds or a surface-aware
build entry, and explicit sharing of D1/R2/Vectorize bindings. Only one Worker
should own the cron trigger and Cloudflare Email handler. The repository is
currently configured for the one-Worker/two-hostname model; use two Workers
only when independent release, scaling, or failure isolation is worth the
additional deployment and migration coordination.

Cloudflare Access is useful with either model, but it is not a substitute for
Better Auth/RBAC or the Worker edge guard.

## Reverse Proxy Contract

OnFire reserves `/support` as the isolated customer-portal mount. A product
origin may expose the portal at `https://product.example.com/support` by
proxying `/support` and every descendant to the OnFire Worker **without
stripping the prefix**.

Supported external paths:

- `/support` and `/support/` - portal home
- `/support/tickets/*` - customer ticket detail pages
- `/support/api/toc/*` - customer APIs
- `/support/_next/*` - isolated Next.js assets
- `/support/sw.js` and `/support/icon.svg` - portal public assets

`/support/admin`, `/support/api/tob/*`, and every unlisted path return 404.
The proxy must preserve the HTTP method, query string, request body, response
status, response headers, and streaming body. It may send either the product
Host or the canonical OnFire Host; OnFire does not derive security-sensitive
URLs from it.

Do not cache HTML or `/support/api/toc/*`. Hashed files below
`/support/_next/static/*` may use their upstream immutable cache policy.
Preserve `Referrer-Policy`, `Content-Security-Policy`,
`X-Content-Type-Options`, and `Service-Worker-Allowed` response headers.

### Cloudflare Worker Example

```ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const incoming = new URL(request.url);
    if (
      incoming.pathname === "/support" ||
      incoming.pathname.startsWith("/support/")
    ) {
      const upstream = new URL(request.url);
      upstream.protocol = "https:";
      upstream.host = "support.example.com";
      return fetch(new Request(upstream, request));
    }
    return env.PRODUCT_ORIGIN.fetch(request);
  },
};
```

### nginx Example

```nginx
location = /support {
  proxy_pass https://support.example.com/support;
  proxy_set_header Host support.example.com;
  proxy_set_header X-Forwarded-Proto $scheme;
}

location ^~ /support/ {
  # No trailing path on proxy_pass: preserve the complete /support/* URI.
  proxy_pass https://support.example.com;
  proxy_set_header Host support.example.com;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

The browser sees the product origin, so portal requests are same-origin and no
CORS headers are required. Direct browser calls from an unrelated origin are
intentionally unsupported; OnFire does not reflect Origin and does not return
`Access-Control-Allow-Origin`.

## Identity Resolver V1

Configure a product's remote identity endpoint and Bearer secret in Product
Management. The secret is AES-GCM sealed with a key derived from `AUTH_SECRET`
before it is stored in D1 and is never returned by an API.

The product creates a short-lived, opaque, preferably single-use credential
and opens:

```text
https://product.example.com/support?productId=prod-123#credential=opaque-value
```

The credential must be in the URL fragment. Fragments are not included in HTTP
requests, Referer headers, proxy logs, or server-rendered HTML. The portal
removes the fragment before exchanging it.

OnFire calls the configured endpoint as follows:

```http
POST /configured/userinfo HTTP/1.1
Authorization: Bearer <configured-server-secret>
Content-Type: application/json
Accept: application/json
X-OnFire-Identity-Protocol: onfire-userinfo-v1

{"credential":"opaque-value","productId":"prod-123"}
```

Success response:

```json
{
  "externalId": "business-user-123",
  "email": "user@example.com",
  "level": 80,
  "expiresAt": "2026-07-12T10:30:00Z"
}
```

`externalId` is required. `email`, `level`, and `expiresAt` are optional. The
resolver should return 401 or 403 for an invalid, expired, consumed, or
product-mismatched credential. Credentials should expire within 60 seconds,
be bound to one product, and never be logged.

Resolver endpoints must use a public DNS hostname, HTTPS, and port 443. OnFire
rejects embedded credentials, fragments, IP literals, local/internal host
suffixes, redirects, responses over 64 KiB, non-JSON responses, and calls over
five seconds.

After a successful exchange, OnFire stores the product-scoped customer record
and signs a 24-hour internal JWT containing only `sub`, `productId`, and
`tenantId`. Email, external ID, and level are loaded from D1 for every
authenticated request and are never embedded in the browser-readable JWT.
