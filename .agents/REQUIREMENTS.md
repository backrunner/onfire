# Current Requirements

## RBAC And Scope

- Keep SuperAdmin > TenantAdmin > ProductAdmin > TeamAdmin > Agent.
- Enforce permission and data scope at every API boundary; UI hiding is never authorization.
- SuperAdmin is global, TenantAdmin tenant-scoped, ProductAdmin limited by `user_products`, TeamAdmin and Agent team-scoped.
- Split product lifecycle from product configuration: `product.manage` creates/deletes products, while `product.settings` reads and updates SLA, auto-close, and team associations. ProductAdmin receives only `product.settings` within `user_products` scope.
- Agents may escalate because escalation is required by the lifecycle. They may reassign only within their team when `allowReassign` is enabled.
- AI credentials are SuperAdmin-only. TenantAdmin and ProductAdmin may maintain knowledge within product scope.
- AI assistant ticket context must pass `assertTicketVisible` before reaching a model.
- Reject deletion of a tenant, product, or team with dependent records using HTTP 409.
- Validate every submitted tenant/product/team association on create and update. SuperAdmin bypasses visibility scope, never tenant-integrity checks.
- Product creation may omit `tenantId`; the API assigns the creator's tenant as the default. An explicitly submitted tenant remains subject to the same existence, permission, and tenant-integrity validation.

## Account Security

- The account page exposes one security-settings entry. Password changes, Passkey management, and authenticator TOTP management live inside that modal instead of separate page forms.
- ToB login supports password and Passkey. Password sign-in for a TOTP-enabled account must complete the Better Auth second-factor challenge before a session is created; recovery codes remain available as the fallback.
- Passkeys use the exact `BETTER_AUTH_URL` hostname as the WebAuthn RP ID and its origin as the allowed origin. Registration requires an authenticated session, and users may list, rename, and delete only their own credentials.
- TOTP enrollment requires the current password and a verified first code. Recovery codes are shown only when generated, trusted-device state lasts 30 days, and disabling or regenerating TOTP credentials requires the current password.

## MCP OAuth Delegation

- Serve MCP only on the ToB surface at the canonical `BETTER_AUTH_URL` `/mcp`
  resource. Publish RFC 9728 protected-resource metadata and RFC 8414
  authorization-server metadata from that same origin. Derive every advertised
  issuer and endpoint locally; malformed canonical configuration or provider
  metadata must fail closed with a non-cacheable 503.
- Use OAuth 2.1 authorization code flow for public clients with mandatory PKCE
  S256, optional refresh tokens through `offline_access`, refresh rotation,
  dynamic client registration, and token revocation. Do not expose OAuth
  userinfo, introspection, privileged client-administration, or internal consent
  endpoints through the public auth catch-all.
- Keep protocol scopes separate from business delegation. `onfire:mcp` permits
  access to the MCP resource; the durable application grant separately records
  atomic OnFire permissions and selected business resources. `offline_access`
  requests refresh-token issuance; it is not a protected-resource scope and
  must not appear in the MCP `WWW-Authenticate` challenge.
- Support `tickets:read`, `tickets:reply`, `tickets:update_status`,
  `tickets:update_priority`, `tickets:assign`, `tickets:reassign`,
  `tickets:escalate`, `tickets:close`, `settings:read`, and `settings:write`.
  Register only tools allowed by the effective atomic permissions, and require
  the matching atomic permission again inside every operation before any
  database read or mutation.
- A user may grant only permissions available to their current role. Every MCP
  request recomputes effective permissions from the stored grant and live RBAC;
  ticket and product access must also pass the normal live tenant, product, and
  team scope checks. Agent reassignment must query the current agent-team
  membership and team policy immediately before use instead of trusting the
  request-start team snapshot.
- Resource mode is either all currently accessible resources or an explicit
  union of selected tenants and products. A selected tenant covers only products
  the user can access in that tenant, including later accessible products; a
  selected product covers only that product. Unknown persisted modes and empty
  selected grants fail closed.
- Reauthorization must invalidate every prior access and refresh token for the
  user/client before replacing its grant in the same D1 batch. Account-side
  revocation must invalidate both token types, delete protocol consent, and mark
  the application grant revoked in one batch.
- Bind authorization codes, access tokens, and refresh-token families to the
  exact application-grant version approved by the user. Unbound or stale
  families fail closed. Browser logout must not revoke a valid delegated token;
  live user existence, RBAC, and business scope are still checked per request.
- Every interactive authorization request must reopen the OnFire consent page,
  even when protocol consent already covers the same scopes and resource, so
  users can replace atomic permissions and resource selections. Preserve
  `prompt=none` as non-interactive and never inject consent into it.
- Require one exact canonical `/mcp` resource indicator on authorization and
  token requests and in explicit DCR resource metadata. Bound DCR metadata,
  callback count, string lengths, request bodies, methods, media types, and
  public request rates before the OAuth plugin persists or processes input.
  Revalidate the provider-signed consent query's response type/mode, scopes,
  resource, callback shape, parameter cardinality, and PKCE S256 structure in
  the OnFire consent API. Access tokens must contain only unique `onfire:mcp`
  and optional `offline_access` scopes.
- Accept OAuth callbacks only over HTTPS or exact HTTP loopback hosts
  `localhost`, `127.0.0.1`, and `[::1]`; reject private-use schemes,
  non-loopback HTTP, credentials, fragments, and noncanonical loopback aliases.
  Revalidate every persisted callback whenever a client is used. Native clients
  may vary the port of an otherwise exact HTTP loopback callback; other
  callbacks require exact registered-string matching.
- Validate the `Origin` header on every `/mcp` method before rate limiting or
  bearer lookup. A missing header remains valid for native clients; a present
  header must equal the canonical ToB origin or receive HTTP 403.
- Evaluate encoded and normalized path variants in the Worker surface guard so
  encoded API, discovery, and MCP paths cannot cross the ToB/ToC boundary.
- Continue using dynamic client registration as the public-client fallback.
  Do not enable Client ID Metadata Documents until the Workers transport can
  pin an approved DNS result for the full fetch and reject redirects; ordinary
  `fetch` leaves a DNS-rebinding SSRF gap.
- The ToB consent page must use existing zinc theme, light/dark and bilingual
  controls, responsive spacing, atomic permission checkboxes, read-only/full
  presets, tenant/product selection, an explicit full-access warning, and the
  validated callback hostname. Loopback callbacks require an additional local
  device warning. The account page must list effective connected-application
  access and support confirmed immediate revocation.
- OAuth authorize/token/register/revoke, `/mcp`, consent-context, and connected-
  application responses must use `Cache-Control: no-store` and
  `Pragma: no-cache` on both success and failure paths.
- When Cloudflare Access protects the ToB hostname, create narrowly scoped path
  exceptions for OAuth discovery, DCR/token/revoke, and `/mcp`; standard clients
  cannot complete machine-to-machine protocol calls through an interactive
  Access challenge. Keep `/admin/*` and the remaining `/api/tob/*` protected.

## Ticket Lifecycle And SLA

- New tickets start only the accept SLA. Reply SLA begins when an agent is assigned and resets on reassignment or escalation.
- A public agent reply clears the first-reply deadline. A later customer reply changes the ticket back to processing but must not resurrect a completed first-reply SLA.
- Dashboard, list, search, warning, and breach logic must use the same current-state SLA predicate; stale deadlines are never counted as overdue.
- ToC ticket create, reply, and escalate operations require the configured rate limit and Turnstile verification.

## Ticket Types And Form Versions

- Define ticket types before forms. Types belong to one product and form a tree of at most three levels.
- Any active type with an active current form version is selectable in ToC, including a parent that also has children. ToC never asks the customer to select or understand a template.
- A type owns at most one form series. Every save creates the next immutable version and makes it current immediately; there are no drafts.
- Previously current versions remain valid for already-open forms until an administrator irreversibly invalidates them with an audited reason. The current version cannot be invalidated while the form remains active.
- Tickets pin `ticketTypeId`, optional `templateVersionId`, and the submitted type-path snapshot. Renaming, moving, archiving, or invalidating configuration never changes historical ticket rendering.
- Types and forms use archive/restore instead of physical deletion. A parent with active children cannot be archived.
- Resolve assignment from the selected type to its nearest routed ancestor, then the tenant default team. Every product owns a hidden, non-deletable `unclassified` fallback type.
- Tenant administrators may maintain reusable ticket-type preset trees with the same three-level limit. Product administrators may copy an active preset subtree into an accessible product; copied types have no live preset linkage and evolve independently.
- Internal operational states belong to one exact product ticket type and support boolean or finite-select controls. They are visible only in ToB, never in ToC form selection or submission metadata.
- Internal-state definitions archive instead of deleting. Existing ticket values remain readable after archive, archived definitions cannot be changed on tickets, and every value mutation writes an `internal_state_changed` history record.

## ToB Interaction

- Top search is a ticket suggestion combobox. Suggestion click opens the ticket; Enter opens `/admin/search?q=...`.
- Prefetch primary admin routes and suggested tickets. Avoid server navigation for local tab-only state.
- Product selectors render a clear disabled state when no product exists.
- Mutable rows require discoverable edit actions; destructive actions remain separated in the row menu.
- Management form save handlers must rerun their field validators and submit only validator-normalized payloads; button state and native input constraints are not sufficient validation.
- Grid siblings and empty/error/loading states use stable equal heights.
- Discarding unsaved email settings restores the persisted product snapshot; revisiting the settings tab must not report a transient initialization difference as unsaved.
- Keep title-to-content spacing compact in management, email, and AI forms.
- Ticket and customer search match email and `externalId`; external-ID-only customers use a safe label and never render a `mailto:null` action.
- Notification policy dialogs keep save/cancel visible while the form body scrolls, report validation beside the affected field, and confirm before discarding changed drafts.
- Notification compliance stays compact by default: missing recipients are searchable, collapsible, and revealed in bounded batches rather than rendered as one unbounded list.

## Runtime Routing

- One Worker continues to route ToB and ToC through `src/middleware.ts` until OpenNext supports Next 16 Node `proxy.ts`.
- Middleware must remain limited to Web/Edge-compatible APIs. Do not move authentication, database access, filesystem work, or other Node-only logic into this layer.
- Preserve exact host matching, admin-domain rewrites, ToC admin redirects, and API/static bypass behavior with middleware tests.
- Reserve `/support` as the reverse-proxy mount. The upstream proxy preserves the prefix; OnFire maps only ToC pages, `/api/toc`, scoped static assets, the icon, and service worker. Never expose ToB pages or APIs below this prefix.
- Keep reverse-proxied portal traffic same-origin. Do not add wildcard or reflected CORS; direct cross-origin browser APIs remain unsupported.
- Enforce the same surface split at the Worker edge: ToC hosts cannot reach `/api/tob/*`, and ToB hosts cannot reach `/api/toc/*`. Middleware API bypass must not weaken this guard.
- Production hostnames are `onfire.alkinum.com` (ToB) and `support.alkinum.io` (ToC), both attached to the same OpenNext Worker as Cloudflare Custom Domains. Cloudflare Access should protect the ToB hostname. Treat two independent Workers as a separate deployment project with explicit shared-binding and cron/email ownership decisions.
- Scope the reverse-proxy service worker to `/support/`; it must never control the product origin root.

## Customer Identity

- Keep API-key JWT issuance for server integrations, and support Product Identity Resolver v1 for browser portal bootstrap.
- Remote credentials are short-lived opaque values delivered in the URL fragment, never user PII or a reusable API key.
- Resolver calls are server-side POST requests authenticated with a sealed product Bearer secret. Require public HTTPS port 443, deny redirects and local/IP endpoints, limit response size and timeout, and validate the response schema.
- Internal customer JWTs contain only `sub`, `productId`, and `tenantId`. `withCustomerAuth` must load the current D1 customer and verify customer/product/tenant consistency before exposing email, external ID, or level.
- A customer email is optional when a non-empty product-scoped `externalId` is available. Every label and notification path must handle that absence explicitly.
- Keep network and credential-specific rate limits separate so a reverse proxy's shared egress IP cannot block all product users.

## AI

- Language providers: OpenAI, Anthropic, Google, xAI, DeepSeek.
- OpenAI persists `responses` or `chat`; default to Responses, retain Chat for compatible gateways.
- Embedding providers: OpenAI, Qwen/DashScope, Jina AI, Cohere, Google.
- Store provider credentials independently from task routing so one encrypted credential can be reused by multiple AI functions.
- Each AI task owns an ordered credential route with a model per route entry. Runtime calls skip disabled or cooling-down credentials and try the next configured entry after a provider failure.
- When a failed credential has another available route entry, place it in a configurable cooldown. Do not cooldown the final credential, and never repeat a successful provider call because health bookkeeping failed.
- All embedding adapters output exactly 1024 dimensions and distinguish document/query input where supported.
- Store and query vectors in product namespaces, with a scoped D1 fallback.
- Every language provider treats a successful HTTP response with an empty completion as a protocol error; do not store or display an empty model answer as success.

## Email

- Configuration and custom templates are per product.
- Missing custom templates use system defaults. Custom templates support email-safe HTML and documented variables.
- Template authoring uses a locally bundled Monaco HTML editor. The editor loads only when a template is opened, starts with formatted HTML, and offers format/minify toolbar actions plus keyboard shortcuts. Quick variables insert at the current selection, template tokens are highlighted, and the editor must not depend on a CDN at runtime.
- User-correctable validation and HTTP 4xx feedback use warning toasts; authorization, network, and server failures use error toasts.
- Preview and delivery share the same renderer; user-controlled variables are escaped.
- Preview uses a sandboxed iframe with no scripts, forms, external requests, or same-origin access.
- Email Routing trusts the SMTP envelope and consumes the raw stream once.
- Normalization trims plain text before choosing it. A blank plain-text MIME part must fall back to the sanitized HTML-derived content instead of creating an empty ticket or reply.
- Cloudflare Email Sending uses `SEND_EMAIL` and sends HTML plus text.
- Outbound replies propagate `In-Reply-To` and `References` through every provider. Maileroo uses the v2 structured email API and stores its returned reference ID.
- Run deterministic local spam checks before external or AI work: duplicates, empty content, upstream spam verdicts, strict SPF/DKIM failures, automated/bounce/list mail, and sender rate limits.
- Support one optional generic HTTPS JSON spam classifier at global or tenant scope. Tenant configuration overrides or disables the global default; failures continue to AI instead of dropping mail.
- External spam endpoints are sealed-credential outbound fetch sinks: public HTTPS/443 only, no redirects, bounded timeout/body, and strict response validation.
- New inbound email uses one AI prescreening call for spam/support judgment, type selection, and ticket insights. Invalid or low-confidence type choices fall back to the product's `unclassified` type.
- Spam and non-support results enter a recoverable quarantine with stage, provider, score, reason, and release audit. Releasing a new thread requires an explicit ticket type; replies retain the original ticket type.

## Notifications

- Users own their notification endpoints and secrets. Products never store recipient email addresses, device keys, bot tokens, chat IDs, or webhook URLs.
- Every system user starts with an enabled email endpoint configured from their account email. Existing users without an email endpoint are backfilled, while later endpoint changes remain user-controlled.
- Product delivery rules select events, channel types, and recipients from current assignee, current ticket team, all product agents, a specific team, or a specific agent.
- Product requirements select events and mandatory channel types for all product agents, a team, or a specific agent. A matching requirement is a mandatory delivery overlay, not only a compliance warning.
- Resolve policies to active support agents and then to their enabled personal endpoints. Deduplicate overlapping rules and requirements by recipient plus endpoint.
- Persist a failed delivery log when a selected or mandatory endpoint type is missing; never silently discard a required notification.
- Endpoint credentials are sealed with `AUTH_SECRET`, omitted from API responses, and editable with blank-secret preservation.
- A user may send a test through only their own saved endpoint. Email endpoint tests require a product visible to that user so delivery uses that product's outbound provider; test sends do not create ticket notification logs.
- Supported endpoint types are email, PushDeer, Bark, ntfy, Telegram, Discord, Slack, Microsoft Teams, Feishu, DingTalk, and WeCom. Keep provider definitions and factories centralized so new channels do not change product policy storage.
- Email endpoints send through the event product's outbound provider. Slack, Teams, Discord, Feishu, DingTalk, and WeCom endpoints use bounded HTTPS webhook requests; Feishu and DingTalk support optional signed-robot secrets.
- Notification administration requires `notification.manage` plus product scope. Every authenticated user may maintain only their own endpoints.

## Customer Session Expiry

- Customer JWTs are valid for 24 hours and the token endpoint returns `expiresIn` in seconds.
- Products may configure a homepage URL and an optional expired-session deep-link URL. The deep link wins; the homepage is the fallback.
- On 401, ToC clears the JWT but retains only the product ID long enough to load the public, HTTP(S)-validated return destination. Concurrent 401s must not erase that product context.

## Runtime Configuration And Release Gates

- Configure `TURNSTILE_SECRET` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` together. A server secret without a build-time site key fails closed; leaving both unset disables Turnstile intentionally.
- Keep `pnpm-lock.yaml`, `wrangler.types.env`, and generated `worker-configuration.d.ts` reproducible in a clean checkout. `wrangler.types.env` contains names and empty values only.
- After a Wrangler binding or variable change, regenerate `CloudflareEnv` and require `pnpm cf-typegen --check` in CI.
- Before a release, require frozen install, generated-type check, TypeScript, tests, OpenNext build, Drizzle consistency, fresh local migration apply, Wrangler dry-run, production dependency audit, and startup profiling.
- Deployment, remote D1 migration, Cloudflare resource creation, secret changes, and commits remain explicit operator actions.
