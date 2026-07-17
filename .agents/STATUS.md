# OnFire Project Status

Updated: 2026-07-18

## Current State

- Ticket classification is now product-owned and type-first. Products contain a maximum three-level ticket type tree; any configured node can be submitted, and type routes inherit from the nearest ancestor before falling back to the tenant default team.
- Each ticket type owns one immediately active, immutable form-version series. Saving creates `N+1`, prior versions remain submit-capable until explicitly invalidated, rollback copies old content into a new version, and archive/restore never removes history.
- Tickets pin the selected type, exact form version, and submission-time type path. ToB details render historical custom fields with the pinned schema, while ToC exposes an expandable type tree and hides template selection.
- Every product has a protected hidden `unclassified` type for AI failure. Legacy template/category rows remain read-only and are backfilled into archived historical form versions.
- Inbound email now applies local deterministic spam checks, an optional tenant-over-global HTTPS classifier, and one AI prescreening call for support judgment, type selection, and insights. Filtered messages enter an audited quarantine that administrators can release.

- Notifications now separate user-owned receiving endpoints from product-owned delivery policy. Product rules select events, recipient scopes, and channel types; mandatory requirements both drive delivery and report missing endpoint compliance.
- Personal endpoints support email, PushDeer, Bark, ntfy, Telegram, Discord, Slack, Microsoft Teams, Feishu, DingTalk, and WeCom through a centralized provider registry. Secrets are sealed and omitted from browser responses.
- Personal endpoints expose an owner-only test action. Email tests select a visible product and reuse its outbound provider; other channels test their stored provider configuration directly.
- Notification administration now has explicit metadata and endpoint load failures, fixed-action dialogs with inline validation and discard confirmation, compact policy summaries, and searchable/batched compliance details.
- Recipient resolution supports current assignee, ticket team, all product agents, specific teams, and specific agents. Overlapping policies deduplicate endpoints, while missing selected methods create failed delivery logs.
- Cloudflare Email Routing inbound mail is parsed once, normalized, authenticated through the internal task endpoint, deduplicated, threaded, filtered, and persisted.
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
- Worker version `c683cfd6-7d5f-42d9-a161-4f1a587773fe` is deployed with both Custom Domains, the `*/5 * * * *` SLA cron, and all configured D1/R2/Vectorize/Email/service bindings. The public ToC health endpoint returns 200, the ToC-to-ToB cross-surface probe returns 404, unauthenticated ticket-type requests return JSON 401, and Cloudflare Access intercepts unauthenticated ToB probes with its expected 302 login redirect.
- Production `AUTH_SECRET` and `TURNSTILE_SECRET` are set as Worker secrets. The database remains intentionally uninitialized at the application level (`needsInstall: true`) until the first SuperAdmin completes `/admin/install`.
- RBAC combines role permissions with tenant, product, and team scope. ProductAdmin scope comes from `user_products`; support-agent membership remains separate.
- Product lifecycle and product settings are separate permissions. ProductAdmin can update scoped SLA, auto-close, and team associations without creating or deleting products.
- Tenant/product/team writes reject cross-tenant associations, including SuperAdmin requests, and dependency-protected deletes return HTTP 409.
- Global search provides scoped ticket suggestions. Clicking opens the ticket; Enter opens the full search page.
- OpenAI language tasks select Responses API or Chat Completions. Embeddings are independent and support OpenAI, Qwen, Jina, Cohere, and Google.
- AI provider credentials are managed in a reusable credential pool. Each AI function has an ordered credential/model route; provider failures automatically fall through to the next available credential and temporarily cool down failed credentials when a fallback exists.
- Embeddings use a fixed 1024-dimension contract and product-scoped Cloudflare Vectorize namespaces. Knowledge mutations synchronize vectors and AI workflows use semantic retrieval with a D1 fallback.
- ToB management lists use compact equal-height panels, stable empty states, explicit empty product selectors, and edit flows for all mutable entities, including API key names.
- Inbound normalization keeps a non-blank HTML body when the plain-text field is blank. Provider adapters fail fast on empty AI completions instead of persisting unusable answers.
- Customer records may be identified by `externalId` without an email; ToB labels, ticket lists, and search use the external identity without rendering or linking `null`.
- SLA deadlines follow ticket state: unassigned tickets do not start reply SLA, assignment/escalation starts or resets it, public agent replies clear it, and dashboards only count deadlines valid for the current state.
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

A fresh local D1 successfully applied migrations `0000` through `0013`. A separate non-empty legacy fixture also verifies unique migrated type keys, invalid legacy metadata tolerance, pinned version backfill, and historical path snapshots. Production D1 also has migrations `0000` through `0013` applied.

## Verification

- `pnpm lint`: passing.
- `pnpm test`: 43 files, 182 tests passing, including ticket type paths and inherited routing, immutable form versions, non-empty legacy migration, archived-template recovery, concurrent and closed-thread quarantine release, customer projection privacy, unclassified fallback, external spam protocol safety, notification membership and delivery, redirect rejection, AI failover, proxy isolation, resolver limits, SLA state transitions, and RBAC scope.
- `pnpm build:worker`: passing with OpenNext Cloudflare 1.20.1, Next 16.2.10, Wrangler 4.110.0, and Wrangler-generated workerd runtime types.
- `pnpm cf-typegen --check`: passing with generated `CloudflareEnv`; `wrangler.types.env` keeps secret typing deterministic without storing values.
- `pnpm exec drizzle-kit check`: passing.
- `pnpm install --frozen-lockfile`: passing on the tracked pnpm lockfile.
- `pnpm audit --prod`: no known vulnerabilities after scoped esbuild/PostCSS overrides in `pnpm-workspace.yaml`.
- `wrangler deploy --dry-run`: passing with all D1, R2, Vectorize, Email, service, and asset bindings detected.
- `wrangler check startup`: passing; final local CPU profile span was approximately 325 ms (the generated profile was removed after inspection).
- Wrangler local workerd smoke: admin-domain rewrite returns 200, ToC `/admin` access redirects with 307, and API bypass returns 200.
- Playwright desktop/mobile visual regression: passed in light and dark at 1440x900 and 390x844 for product ticket-type trees, parent/child ToC selection, form-version history, the responsive form editor, type routing, external spam settings, notification summaries, fixed-footer policy dialogs, inline validation, metadata/endpoint errors, batched compliance details, personal endpoint rows, and endpoint testing.
- Local Wrangler reverse-proxy smoke: `/support` HTML and prefixed CSS/JS load successfully; ToB paths below `/support` return 404; cross-origin preflight receives no CORS allow headers; the portal has no browser console errors.

## Deployment Prerequisites

- Target Cloudflare account is `Alkinum` (`b6754402d59fc29ee8b62119014fec89`). On 2026-07-13, the APAC `onfire-d1` D1 database (`3f3294ab-8c05-4935-93c0-677ee18641dd`), APAC Standard `onfire-storage` R2 bucket, and 1024-dimension cosine `onfire-knowledge` Vectorize index were created.
- `wrangler.jsonc` contains the production D1 ID. Migrations `0000` through `0013` are applied remotely, Wrangler reports no pending migration, the new tables are queryable, and `PRAGMA foreign_key_check` returns no violations.
- `wrangler deploy --dry-run` resolves all DB, R2, Vectorize, Email, service, and asset bindings against the production configuration.
- Vectorize has no local simulator. Use a selected Cloudflare account and temporary remote binding only when remote development is intended; do not commit an account ID.
- Enable Cloudflare Email Sending for the sender domain and route inbound email to the Worker. The current Wrangler OAuth token lacks `email_sending:write` and `email_routing:write`, so this remains pending a refreshed login.
- Configure `AUTH_SECRET`. Configure `TURNSTILE_SECRET` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` together; if either is intentionally disabled, leave both unset. Never commit `.dev.vars`.
- Run `pnpm cf-typegen` after any Wrangler binding or variable change and keep the generated `worker-configuration.d.ts` plus `wrangler.types.env` in the checkout.
- `onfire.alkinum.com` and `support.alkinum.io` are attached to the same Worker, the Worker surface guard is verified, and Cloudflare Access is enforced on the ToB hostname.

## Known Follow-up

- PDF/DOC/DOCX uploads are stored in R2, but text extraction and chunk embedding still need a Worker-safe processing pipeline. Knowledge entries are fully embedded now.
- Migrate `middleware.ts` to `proxy.ts` only after OpenNext supports Next 16 Node Proxy. Until then, keep domain routing Web API-only; Node-only proxy features are not required by OnFire.
