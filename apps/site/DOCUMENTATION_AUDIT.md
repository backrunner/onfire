# Documentation source audit — 2026-10-14

This refresh describes the current working-tree implementation, including the
pending decision-filter changes and migrations 0034/0035. It is not evidence of
a production deployment. English and Chinese have matching chapter coverage;
the static site contains 32 handbook pages and two landing pages.

Paths below are relative to the repository root. These contracts, rather than
older status entries or proposed features, are the maintenance reference.

| Handbook chapter (both locales) | Implementation and operator references checked |
| --- | --- |
| Overview / Quick start | `package.json`, `.env.example`, `.dev.vars.example`, `scripts/local-dev.ts`, `.agents/REQUIREMENTS.md` |
| Deployment | `wrangler.jsonc`, `worker.ts`, `workers/email-agent/wrangler.jsonc`, `docs/DEPLOYMENT.md`, `.agents/EMAIL_AGENT_INTEGRATION.md`, site Vite/config/package files |
| Tickets | `src/lib/tickets/state-machine.ts`, `src/services/allocation.ts`, `src/services/sla-scan.ts`, ticket APIs, `src/lib/rich-text.ts`, ticket-number migration 0033 |
| Roles / scope | `src/lib/types.ts`, `src/lib/auth/admin-context.ts`, `src/lib/ai-scope.ts`, management pages and scoped APIs |
| AI / knowledge | `src/lib/ai-config.ts`, `src/services/ai/config.ts`, providers, `src/services/ai/vector-space.ts`, knowledge services, `src/app/api/tob/admin/ai/documents/route.ts` |
| Spam / decision spec | `src/services/email/spam-filter.ts`, `src/services/ai/providers/spam-decision.ts`, TypeSafe adapter, customer intake APIs, `src/lib/onfire-docs.ts`, migrations 0034/0035 |
| Types / immutable forms | `src/services/ticket-types.ts`, `ticket-templates.ts`, `ticket-type-presets.ts`, `ticket-internal-states.ts`, type/version APIs |
| Languages | `src/lib/product-language.ts`, `src/services/ticket-translation.ts`, `src/services/ai/translation.ts`, customer projections and reply APIs |
| Notifications | `src/lib/notifications/`, `src/services/notification/`, policy/endpoint APIs and account management |
| Account security | `src/lib/auth/server.ts`, `src/lib/auth/login-protection.ts`, account security UI and `.agents/REQUIREMENTS.md` |
| Email | `src/app/api/toc/webhooks/`, `src/services/email/`, `src/lib/email-templates.ts`, `worker.ts`, `workers/email-agent/`, `.agents/EMAIL_AGENT_INTEGRATION.md` |
| Customer portal | `src/app/api/toc/tokens/route.ts`, identity exchange, `src/lib/auth/customer.ts`, `remote-identity.ts`, `src/lib/hooks/use-toc-credentials.ts`, `src/lib/toc-proxy.ts`, `.agents/TOC_INTEGRATION.md` |
| Account REST keys | `src/lib/api-keys/`, account key APIs, `src/lib/api/handler.ts`, `docs/API_KEYS.md` |
| MCP / WebMCP | `src/lib/mcp/`, `src/lib/webmcp/catalog.ts`, `runtime.ts`, `.agents/MCP_INTEGRATION.md`, `.agents/WEBMCP_INTEGRATION.md` |
| Recovery / operation | Queue/outbox/receipt handling in application and email agent, cron handlers, quarantine release APIs, `docs/DEPLOYMENT.md`, email-agent integration reference |

## Corrections with operational consequences

- System AI remains SuperAdmin-only; authorized tenant/product administrators
  can manage their own AI scopes. Existing requirements were corrected.
- A stored knowledge document marked `ready` is not extracted or indexed.
  Structured knowledge entries are the implemented retrieval source.
- A configured decision filter requires both spam and genuine-support evidence.
  Provider outages hold mail and reject customer writes; low spam probability
  alone does not establish a genuine ticket. The public spam chapter owns the
  HTTP spec linked from the dashboard.
- The generic inbound route is `/api/toc/webhooks/inbound`. No source rewrite
  implements the previously documented `/webhooks/inbound` alias; the site and
  AGENTS reference now use the actual route.
- Product keys, customer JWTs, account REST keys and OAuth delegation have
  separate authority and expiry. Browser JWT bootstrap supports fragments;
  opaque identity credentials are fragment-only.
- Provider acceptance differs from inbox delivery. Ambiguous email delivery
  requires receipt reconciliation; there is no dashboard resend operation.

## Framework upgrade

The npm registry and upstream v0.3.0 release were checked on 2026-10-14.
`pnpm exec svedocs upgrade 0.3.0 --package-manager pnpm` upgraded the framework
and CLI together in this independent workspace. The obsolete `$app/environment`
alias and Sharp override were removed. KaTeX 0.19.0 and targeted Satori fflate
0.7.5 overrides cover vulnerable transitive dependencies.

The production dependency audit still reports unpatched upstream `braces`
(high) and `sprintf-js` (moderate) build dependencies. This is not a zero-finding
audit. See README for the license inventory and reproducible validation commands.

## Validation

Frozen installation, Svelte/TypeScript checks (zero errors/warnings), strict
translation/content checks (34 pages / 164 search records, zero errors/warnings),
static build and license inventory (264 packages, no unknown metadata) pass.

Local Chromium checks cover all pages in both themes at 1440px and 390px:
136 page cases, eight interaction cases and 231 internal links. They verify
search/locale scope, paired spec anchors and preserved query state, code copying,
TOC, theme switching, footer navigation/history, active sidebar visibility,
mobile menu closure, no page exceptions or horizontal overflow, Markdown twins,
llms/sitemap/robots/license output, 404 and server-rendered reading without JS.
The harness, JSON results and screenshots are in `.cache/onfire-docs-refresh`.
After final copy polishing, all 34 final-build routes, canonical origins/paths
and bilingual hreflang alternates pass another browser check.
The expanded sidebar initially hid its active final chapter; local navigation
now reveals that chapter within the sidebar/menu without scrolling the article.

`.agents/STATUS.md` records this release boundary. Browser evidence validates
the local built site, not live AI inference, provider delivery, Cloudflare
bindings or a production rollout.
