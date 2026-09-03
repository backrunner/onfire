# OnFire Project Status

Updated: 2026-09-04

## Current State

- Multilingual forms are hardened end to end: companion maps reject empty and default-language keys, the ToC form fallback strips translation maps, translation AI is only required when expanding a product beyond one language, and removing a language cleans orphaned companions on types and template versions in the same batch. `?lang=` and the language cookie normalize to lowercase base tags.
- AI text translation is batched (20 items / 8k chars per call) with placeholder protection in every prompt; translate-content maps provider failures to 502 and rejects default-language targets. ToB search, suggestions, ticket lists, and MCP queries all cover translated content, and internal notes no longer borrow the ticket's customer language.
- The form builder assistant revises the latest unapplied draft on follow-up messages, merges surviving i18n companions on apply, disables apply in translation mode, retries once after truncation, and locks the editor while translate-all runs. Admin content is left-aligned, and legacy template/category-route dead code (UI, API shells, locales, exports, types) is removed.

- OnFire now has a stateless Streamable HTTP MCP endpoint at `/mcp` on the ToB
  origin. OAuth 2.1 authorization code with PKCE S256, dynamic public-client
  registration, refresh rotation, revocation, and RFC 8414/9728 discovery are
  implemented without client secrets.
- MCP consent is a separate OnFire delegation layer: users choose ten atomic
  ticket/product-setting permissions and either all live accessible resources
  or selected tenant/product resources. Runtime authority intersects that grant
  with current RBAC and current role scope on every request.
- Thirteen tools are exposed dynamically: ticket list/detail/agent lookup,
  reply, workflow status, priority, assignment, reassignment, escalation,
  closure, and product settings list/read/update. Mutations reuse existing
  state-machine, SLA, allocation, event, and scope behavior.
- The ToB authorization page is bilingual, responsive, light/dark compatible,
  and consistent with the existing zinc UI. It shows the validated callback
  hostname and warns when authorization returns to a local loopback listener.
  The account page lists effective connected-application access and immediately
  revokes grants, tokens, and protocol consent.
- The OAuth public surface is restricted to authorize, token, registration, and
  revocation. It enforces exact methods/media types, bounded bodies and DCR
  metadata, a canonical `/mcp` resource, strict S256 challenges, and D1-backed
  rate limits. Redirect URIs are restricted to HTTPS or exact HTTP loopback
  hosts (`localhost`, `127.0.0.1`, `[::1]`), and persisted clients are
  revalidated before authorization, token, revocation, consent, or MCP use.
  Reauthorization invalidates old token families before replacing a grant so
  earlier tokens cannot inherit broader authority. Interactive
  authorization always revisits the fine-grained consent page, including when
  protocol consent already exists; `prompt=none` remains non-interactive.
- Authorization codes and access/refresh families are bound to the exact MCP
  grant version approved by the user. Unbound and stale families fail closed;
  reauthorization and account revocation remove their bindings in the same D1
  batch. Browser logout intentionally leaves OAuth delegation valid for
  `offline_access`, while live user/RBAC/resource scope is still recomputed.
- OAuth login now returns password, Passkey, and completed TOTP/recovery-code
  flows to the provider-signed authorization request instead of dropping the
  connection at the admin dashboard. Explicit DCR resources are canonicalized
  to the sole `/mcp` resource. MCP requests validate a present `Origin` against
  the canonical ToB origin before D1 access, then use a strict pre-authentication
  IP bucket and post-authentication grant bucket and require JSON media type.
- Sensitive public OAuth, MCP, consent-context, and connected-application
  responses force `Cache-Control: no-store` and `Pragma: no-cache` on success
  and failure paths.
- MCP protected-resource metadata and `WWW-Authenticate` advertise only
  `onfire:mcp`; `offline_access` remains an optional authorization-server scope.
  CIMD is not enabled because Workers `fetch` cannot pin the validated DNS
  result to the connection, leaving DNS-rebinding SSRF risk; DCR remains the
  supported specification fallback.
- MCP atomic permissions are now enforced both when tools are registered and at
  the start of every ticket/settings operation before database access. Agent
  reassignment checks the current `agent_teams` membership and current team
  policy instead of relying on a request-start scope snapshot.
- OAuth bearer scope parsing now rejects malformed, unknown, or repeated scopes.
  The consent API independently validates the signed query's canonical resource,
  callback, parameter cardinality, code/query response, scopes, and PKCE S256.
  Login completion accepts only same-origin OnFire continuation URLs.
- Canonical MCP/OAuth URLs are restricted to credential-free HTTP(S)
  configuration. MCP and discovery return a no-store 503 before D1/provider use
  when configuration or provider metadata is invalid; authorization-server
  endpoint URLs are always derived locally. Encoded OAuth catch-all paths and
  encoded/normalized cross-surface paths fail closed.

- Ticket classification is now product-owned and type-first. Products contain a maximum three-level ticket type tree; any configured node can be submitted, and type routes inherit from the nearest ancestor before falling back to the tenant default team.
- Tenant administrators can maintain reusable three-level ticket-type preset trees. Product administrators copy an active preset subtree into a scoped product, after which the product tree is fully independent from the tenant preset.
- Product ticket types can define ToB-only boolean and select internal states. Agents update them inline on ticket details; values are audited in ticket history, while archived definitions retain historical values in read-only form.
- Each ticket type owns one immediately active, immutable form-version series. Saving creates `N+1`, prior versions remain submit-capable until explicitly invalidated, rollback copies old content into a new version, and archive/restore never removes history.
- Tickets pin the selected type, exact form version, and submission-time type path. ToB details render historical custom fields with the pinned schema, while ToC exposes an expandable type tree and hides template selection.
- Every product has a protected hidden `unclassified` type for AI failure. Legacy template/category rows remain read-only and are backfilled into archived historical form versions.
- Products now define a default authored-content language and optional English/Chinese supported set. Multi-language enablement requires an effective Translation AI route, and the default language locks once authored ticket types exist.
- ToB ticket type and immutable form editors provide language tabs, manual translation editing, and AI-assisted batch translation. Product-agnostic presets store English plus Chinese text and rebase into the destination product language when copied.
- ToC exposes a product-scoped language switcher, reloads projected type/form/ticket data while retaining compatible drafts, and hides the switcher for single-language products. Customer APIs return one language projection without translation dictionaries or alternate originals.
- Valid Web and inbound-email tickets translate after all filtering/form/routing checks and before insertion. Authorial ticket text remains in base columns with cached per-language subject/content projections and a customer-language preference.
- Public Web/email customer replies translate to the product default; public ToB and MCP replies translate to the customer language. These paths fail before insertion when a required translation is unavailable, internal notes skip translation, and outbound email reuses the stored projection. ToB shows projected customer content with auditable original disclosure.
- Oversized ticket bodies and replies are translated in bounded ordered chunks with one source-language detection. Long rich text translates text nodes in batches and locally preserves sanitized tags, links, and images; any failed chunk aborts the pre-insert translation.
- Inbound email now applies local deterministic spam checks, an optional tenant-over-global external classifier, and one AI prescreening call for support judgment, type selection, and insights. Filtered messages enter an audited quarantine that administrators can release. The classifier can use Postmark SpamCheck, Akismet, OOPSpam, Stop Forum Spam, or a custom `onfire-spam-v1` HTTPS endpoint.
- Product email settings, templates, and logs live on the product configuration page. The former first-level Email sidebar item is gone; `/admin/email` redirects to the product list or a product email tab.
- Product notification rules, requirements, and compliance live on the same product page. The former first-level Notifications sidebar item is gone; `/admin/notifications` redirects to the product notifications tab.
- Teams now have system, tenant, and product scope. SuperAdmin manages system staff from system administration. TenantAdmin is sent to their tenant page (products, users, teams, agents, presets, spam) and never sees the global tenant list. ProductAdmin sees only assigned products, with product-scope teams/agents and no tenant tabs. TeamAdmin and Agent have no management entry. Product staff edits change only product-team memberships.
- SuperAdmin and TenantAdmin can start a read-only preview identity of a lower-role user. `/me` and all ToB APIs overlay that user's live role and scope; mutations return 403 except start/stop preview. The sidebar brand area shows an amber preview indicator with an exit action.
- Local debugging uses `pnpm db:reset` to wipe local D1, apply migrations, and seed a demo tenant/product, ticket types/forms, and `admin@local.onfire` / `admin`. `pnpm db:seed:tickets` inserts more sample tickets. These scripts never touch remote D1.
- AI-dependent features cannot be turned on without a matching enabled credential route. Email AI filtering requires prescreening credentials, knowledge writes require embedding credentials, and an AI task itself cannot be enabled without at least one assigned credential.
- AI credentials and routes can be defined at system, tenant, and product scope. A child scope can inherit the parent route or pick parent credentials. Every model call writes a usage event and updates daily token rollups for system, tenant, and product dimensions. Retention defaults to permanent and can be set in days.
- Inbound replies resolve RFC `In-Reply-To` and `References` values against both sent outbound mail and processed inbound mail, prefer verified thread headers over stale subject markers, and append only after product and customer-email validation.

- Notifications now separate user-owned receiving endpoints from product-owned delivery policy. Product rules select events, recipient scopes, and channel types; mandatory requirements both drive delivery and report missing endpoint compliance.
- Personal endpoints support email, PushDeer, Bark, ntfy, Telegram, Discord, Slack, Microsoft Teams, Feishu, DingTalk, and WeCom through a centralized provider registry. Secrets are sealed and omitted from browser responses.
- Installation and administrator-created users receive an enabled account-email endpoint by default; migration `0015_default_user_email_endpoint.sql` backfills existing users who have no email endpoint without overriding existing endpoint preferences.
- Account security is consolidated behind one modal entry with password changes, Passkey add/rename/delete management, and authenticator TOTP enrollment, recovery-code regeneration, and disable actions. Login supports password, Passkey, TOTP challenges, trusted devices, and recovery-code fallback.
- Personal endpoints expose an owner-only test action. Email tests select a visible product and reuse its outbound provider; other channels test their stored provider configuration directly.
- Notification administration now has explicit metadata and endpoint load failures, fixed-action dialogs with inline validation and discard confirmation, compact policy summaries, and searchable/batched compliance details.
- Recipient resolution supports current assignee, ticket team, all product agents, specific teams, and specific agents. Overlapping policies deduplicate endpoints, while missing selected methods create failed delivery logs.
- Cloudflare Email Routing inbound mail is parsed once, normalized, authenticated through the internal task endpoint, deduplicated, threaded, filtered, and persisted.
- Inbound mail arrives through four paths: the authenticated generic webhook, Cloudflare Email Routing, Maileroo (authenticated by its one-shot `validation_url` callback pinned to `inbound-api.maileroo.net`), and Resend (Svix-signed `email.received` metadata plus body fetch from the receiving API with the product's sealed `inboundApiKey`).
- Outbound email supports Resend, SendGrid, Mailgun, Maileroo, SMTP, and the Cloudflare `SEND_EMAIL` binding with shared logs, text fallbacks, and thread headers.
- Email settings discard restores the persisted product snapshot, including after leaving and re-entering the settings tab; secret drafts clear after a successful save.
- Each product can override four system email templates with custom HTML in a locally bundled Monaco editor. The editor lazy-loads when opened, formats HTML by default, provides format/minify actions and shortcuts, supports cursor-aware quick variables and placeholder highlighting, and has a sandboxed live desktop/mobile preview.
- Customer JWTs expire after 24 hours. Product homepage and optional expired-session deep-link URLs now guide expired ToC sessions back to the product with HTTP(S)-only validation.
- ToC can be mounted under a product origin at `/support` without sharing root `/_next` or API paths. The Worker constrains the prefix to ToC routes, serves prefixed assets through `ASSETS`, and scopes its service worker to `/support/`.
- Product Identity Resolver v1 exchanges a fragment-held opaque credential server-side. Resolver secrets are AES-GCM sealed, outbound calls are SSRF/redirect/timeout/size constrained, and internal JWTs contain only `sub`, `productId`, and `tenantId`.
- Theme SSR is cookie-driven: the server emits the saved `light`/`dark` class and `color-scheme`, while a pre-paint fallback handles first-visit system preference; client toggles persist cookie and localStorage together without theme flash.
- Worker edge routing now rejects `/api/tob/*` on ToC/unknown hosts and `/api/toc/*` on ToB hosts; domain-level Zero Trust policies can therefore be applied without leaving the opposite API surface public.
- Current deployment target is one OpenNext Worker attached to `onfire.alkinum.com` (ToB) and `support.alkinum.io` (ToC) as Custom Domains. Two physically independent Workers are intentionally not enabled yet; they require separate Wrangler environments/build entries and single-owner coordination for cron/email.
- The fallback `workers.dev` hostname is disabled in production; traffic enters through the two configured Custom Domains only.
- Worker version `dea21d6f-01d4-44a2-a568-82869490533e` is deployed at 100% traffic with both Custom Domains, the `*/5 * * * *` SLA cron, and all configured D1/R2/Vectorize/Email/service bindings. The public ToC health endpoint returns 200, the ToC-to-ToB cross-surface probe returns 404, unauthenticated ticket-type requests return JSON 401, and Cloudflare Access intercepts unauthenticated ToB probes with its expected 302 login redirect.
- Production `AUTH_SECRET` and `TURNSTILE_SECRET` are set as Worker secrets. The application database is initialized and contains its SuperAdmin account.
- RBAC combines role permissions with tenant, product, and team scope. ProductAdmin scope comes from `user_products`; support-agent membership remains separate.
- Product lifecycle and product settings are separate permissions. ProductAdmin can update scoped SLA, auto-close, and team associations without creating or deleting products.
- Product creation can explicitly use the creator's default tenant without selecting a tenant. The product form validates and normalizes every persisted field again at save time, including return URLs, remote identity settings, SLA values, and auto-close values.
- Tenant/product/team writes reject cross-tenant associations, including SuperAdmin requests, and dependency-protected deletes return HTTP 409.
- Global search provides scoped ticket suggestions. Clicking opens the ticket; Enter opens the full search page.
- AI routes persist server-verified text, embedding, and rerank capabilities plus embedding dimensions. Provider-specific catalogs use OpenRouter's separate text/embedding endpoints, Anthropic headers/cursor pagination, Google key pagination and normalized IDs, and exact model matching; the API rejects unlisted, wrong-capability, and non-1024 embedding assignments.
- OpenRouter is supported for language and embedding routes through its OpenAI-compatible API. Cohere and Jina rerank bounded knowledge candidates; missing or failed reranking preserves Vectorize/D1 order, and Cohere search units are not misreported as tokens.
- AI provider credentials are managed in a reusable credential pool. Each AI function has an ordered credential/model route; provider failures automatically fall through to the next available credential and temporarily cool down failed credentials when a fallback exists.
- Embeddings use a fixed 1024-dimension contract and product-scoped Cloudflare Vectorize namespaces. Knowledge mutations synchronize vectors and AI workflows use semantic retrieval with a D1 fallback.
- ToB management lists use compact equal-height panels, stable empty states, explicit empty product selectors, and edit flows for all mutable entities, including API key names.
- The admin sidebar normalizes the management-domain root and trailing slashes so Dashboard is selected immediately on `/`, `/admin`, and `/admin/`, while nested navigation remains boundary-safe.
- Inbound normalization keeps a non-blank HTML body when the plain-text field is blank. Provider adapters fail fast on empty AI completions instead of persisting unusable answers.
- Customer records may be identified by `externalId` without an email; ToB labels, ticket lists, and search use the external identity without rendering or linking `null`.
- SLA deadlines follow ticket state: unassigned tickets do not start reply SLA, assignment/escalation starts or resets it, public agent replies clear it, and dashboards only count deadlines valid for the current state.
- Tickets cannot move to `replied` (single, bulk, or MCP) before a public agent reply exists. Agent and customer replies support sanitized rich text with inline images (TipTap editor, R2-backed attachment uploads verified by magic bytes, public unguessable serving for email clients); inbound mail keeps hosted images and formatting while `cid:` and non-image attachments are filtered out.
- Public ToC mutations use D1 rate limits and Turnstile. When `TURNSTILE_SECRET` is set, a missing `NEXT_PUBLIC_TURNSTILE_SITE_KEY` fails closed rather than silently presenting an unprotected form.

## Database

- `0003_customer_identity_optional.sql`: external-ID-only customer identity.
- `0004_low_orphan.sql`: email and ticket relationship updates.
- `0005_wandering_doctor_spectrum.sql`: ProductAdmin `user_products` scope.
- `0006_lowly_sunset_bain.sql`: OpenAI `api_mode` AI configuration.
- `0007_fair_starbolt.sql`: Product homepage and expired-session return URLs.
- `0008_bright_cobalt_man.sql`: per-product remote identity resolver configuration.
- `0009_freezing_slayback.sql`: normalized category-route subcategories and uniqueness constraint.
- `0010_busy_the_hunter.sql`: reusable AI credential pool, ordered per-task credential routes, and credential cooldown health state.
- `0011_easy_the_leader.sql`: user notification endpoints, product delivery rules and requirements, and recipient-oriented delivery logs.
- `0012_normal_old_lace.sql`: distinguish mandatory requirement deliveries from ordinary rule deliveries in notification logs.
- `0013_big_psynapse.sql`: product ticket-type trees, inherited routes, immutable form versions, historical snapshots, external spam configuration, and recoverable inbound quarantine.
- `0014_thick_edwin_jarvis.sql`: tenant ticket-type preset trees, product ticket-type internal-state definitions, and audited per-ticket internal-state values.
- `0015_default_user_email_endpoint.sql`: enabled account-email notification endpoints for existing users who do not already have one.
- `0016_amused_joseph.sql`: Better Auth Passkey credentials, TOTP secrets and lockout state, plus the authentication-user two-factor flag.
- `0017_careful_devos.sql`: Better Auth 1.7 OAuth resources, client-resource
  associations, public clients, assertion replay protection, access and refresh
  tokens, protocol consent, per-user/client MCP atomic grants, and the required
  authentication-account issuer compatibility/index upgrade.
- `0018_broad_la_nuit.sql`: MCP grant versions and authorization-code/token
  family bindings. Existing unbound `0017` grants fail closed and require a
  fresh authorization after the matching Worker is deployed.
- `0019_bright_vision.sql`: named spam-filter provider on global/tenant
  configs so built-in APIs can be selected alongside a custom HTTPS endpoint.
- `0020_natural_selene.sql`: scoped AI credentials and routes, usage events,
  daily token rollups, and retention settings.
- `0021_cynical_kid_colt.sql`: nullable `teams.tenant_id`, `teams.product_id`,
  `teams.scope` (`system` | `tenant` | `product`, existing rows backfill as
  tenant), and `teams_scope_idx`.
- `0022_talented_virginia_dare.sql`: sanitized `replies.content_html` for rich
  text and the `attachments` table for inline reply images stored in R2.
- `0023_boring_terror.sql`: product default/supported languages, type and preset
  i18n companions, ticket customer language, and reply detected-language plus
  cached rich-text translations.
- `0024_acoustic_mother_askani.sql`: cached ticket subject and content
  translation maps while preserving authorial base text.
- `0025_unknown_toxin.sql`: verified model capability and embedding-dimension
  metadata on AI task routes, with legacy Google and Jina model ID normalization.
- `0026_organic_starbolt.sql`: sealed per-product `email_configs.inbound_api_key`
  for the Resend inbound receiving API.

A fresh local D1 applied all 26 migrations from `0000` through `0025`, with no
foreign-key violations, and confirmed the Better Auth 1.7 OAuth/resource
tables, `account.issuer`, MCP grant version, authorization binding table,
scoped AI usage tables, product/team scope columns, and rich-text attachment
tables, product/ticket/reply translation columns, and AI route capability metadata.
A separate non-empty legacy fixture also verifies unique migrated type keys,
invalid legacy metadata tolerance, pinned version backfill, and historical path
snapshots. Production D1 has migrations `0000` through `0022` applied;
`0023` through `0025` remain pending operator application with the matching Worker.

## Verification

- `pnpm lint`: passing.
- Focused MCP/OAuth verification: 20 files and 241 tests passing, including real
  migrated SQLite coverage for authorization-code and token-family binding,
  refresh after browser logout, reauthorization/revocation invalidation,
  provider-code cleanup, managed-user cleanup, OAuth login continuation,
  fail-closed rate limits, canonical DCR resources, HTTPS/loopback callback
  restrictions, persisted-client validation, operation-level atomic permission
  checks, live reassignment membership, signed-consent structure, strict bearer
  scopes, canonical discovery, encoded-path isolation, MCP Origin checks,
  sensitive response no-store policy, and JSON media type.
- Full `pnpm test`: passing, 83 files and 583 tests.
- `pnpm build:worker`: passing with OpenNext Cloudflare 1.20.2, Next 16.2.12, Wrangler 4.120.1, and Wrangler-generated workerd runtime types.
- `pnpm cf-typegen --check`: passing with generated `CloudflareEnv`; `wrangler.types.env` keeps secret typing deterministic without storing values.
- `pnpm exec drizzle-kit check`: passing.
- `pnpm install --frozen-lockfile`: passing on the tracked pnpm lockfile.
- `pnpm audit --prod`: no known vulnerabilities after scoped esbuild/PostCSS/Sharp overrides in `pnpm-workspace.yaml`.
- `wrangler deploy --dry-run`: passing with all D1, R2, Vectorize, Email, service, and asset bindings detected.
- `wrangler check startup`: passing; active CPU was approximately 21.4 ms with
  1.3 ms sampled garbage collection (the generated profile was removed after
  inspection).
- Real local OAuth/MCP smoke: DCR associated the public client with the exact
  `/mcp` resource; PKCE S256 authorization delegated only `tickets:read` to the
  selected Iconwiz product; code exchange returned opaque bearer/rotating
  refresh tokens; `tools/list` exposed only `list_tickets` and `get_ticket`; the
  scoped ticket list returned only Iconwiz; refresh rotation, protocol token
  revocation, and account-side application revocation all produced the expected
  immediate old-token `401` behavior. A second authorization with existing
  protocol consent returned to the fine-grained consent page, while
  `prompt=none` remained non-interactive. All smoke accounts, clients, grants,
  tokens, sessions, authorization codes, and temporary artifacts were removed
  afterwards.
- Wrangler local workerd smoke: admin-domain rewrite returns 200, ToC `/admin` access redirects with 307, and API bypass returns 200.
- Playwright desktop/mobile visual regression: passed in light and dark at
  1440x900 and 390x844 for the bilingual MCP authorization page, full-access
  warning, selected tenant/product controls, Connected applications summary and
  revoke confirmation/empty state, plus the existing tenant preset dialogs,
  responsive internal-state management, live ticket state updates and history
  rendering, product ticket-type trees, parent/child ToC selection, form-version
  history, form editor, type routing, spam settings, notification policy and
  compliance flows, personal endpoint rows, and endpoint testing. No horizontal
  overflow or interactive-element overlap was detected in the new MCP views.
- Multilingual ToB/ToC browser checks: passed at 1440x900 and 390x844 in light
  and dark. Product/type/form translation editing, the customer language
  switcher, translated type/form projections, compatible draft retention, and
  translated ticket list/detail projections render without overflow. Direct
  ToC response inspection confirmed that only the resolved language is exposed,
  with no translation maps, alternate originals, detection metadata, or AI
  fields.
- Skeleton-to-content visual checks: passed at 1440x900 and 390x844 in light
  and dark modes with delayed ToC type/form requests; measured CLS was `0` and
  no horizontal overflow was detected.
- Local Wrangler reverse-proxy smoke: `/support` HTML and prefixed CSS/JS load successfully; ToB paths below `/support` return 404; cross-origin preflight receives no CORS allow headers; the portal has no browser console errors.

## Deployment Prerequisites

- Target Cloudflare account is `Alkinum` (`b6754402d59fc29ee8b62119014fec89`). On 2026-07-13, the APAC `onfire-d1` D1 database (`3f3294ab-8c05-4935-93c0-677ee18641dd`), APAC Standard `onfire-storage` R2 bucket, and 1024-dimension cosine `onfire-knowledge` Vectorize index were created.
- `wrangler.jsonc` contains the production D1 ID. Migrations `0000` through
  `0022` are applied remotely; `0023` and `0024` must be applied with the
  multilingual Worker release. The OAuth, scoped AI usage, team scope,
  rich-text, and attachment tables are queryable, and the last remote migration
  run completed without errors.
- `wrangler deploy --dry-run` resolves all DB, R2, Vectorize, Email, service, and asset bindings against the production configuration.
- Vectorize has no local simulator. Use a selected Cloudflare account and temporary remote binding only when remote development is intended; do not commit an account ID.
- Enable Cloudflare Email Sending for the sender domain and route inbound email to the Worker. The current Wrangler OAuth token includes `email_sending:write` and `email_routing:write`.
- Configure `AUTH_SECRET`. Configure `TURNSTILE_SECRET` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` together; if either is intentionally disabled, leave both unset. Never commit `.dev.vars`.
- Run `pnpm cf-typegen` after any Wrangler binding or variable change and keep the generated `worker-configuration.d.ts` plus `wrangler.types.env` in the checkout.
- `onfire.alkinum.com` and `support.alkinum.io` are attached to the same Worker, the Worker surface guard is verified, and Cloudflare Access is enforced on the ToB hostname.
- Before enabling MCP for standard clients, add narrow Cloudflare Access path
  exceptions for `/.well-known/oauth-*`, `/api/tob/auth/oauth2/register`,
  `/api/tob/auth/oauth2/token`, `/api/tob/auth/oauth2/revoke`, and `/mcp`.
  Keep consent, account management, and the rest of ToB behind Access. The
  current production probe confirms these machine paths still receive Access
  `302` responses until those exceptions are configured. Migrations `0017`
  through `0022` and the matching Worker bundle are deployed; existing OAuth
  connections must authorize again after `0018`.

## Known Follow-up

- PDF/DOC/DOCX uploads are stored in R2, but text extraction and chunk embedding still need a Worker-safe processing pipeline. Knowledge entries are fully embedded now.
- Migrate `middleware.ts` to `proxy.ts` only after OpenNext supports Next 16 Node Proxy. Until then, keep domain routing Web API-only; Node-only proxy features are not required by OnFire.
