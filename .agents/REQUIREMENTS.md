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

## ToB Interaction

- Top search is a ticket suggestion combobox. Suggestion click opens the ticket; Enter opens `/admin/search?q=...`.
- Prefetch primary admin routes and suggested tickets. Avoid server navigation for local tab-only state.
- Product selectors render a clear disabled state when no product exists.
- Mutable rows require discoverable edit actions; destructive actions remain separated in the row menu.
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
