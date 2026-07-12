# Development Standards

## Workflow

1. Read `AGENTS.md`, `.agents/STATUS.md`, and relevant requirements.
2. Inspect the dirty worktree and preserve unrelated changes.
3. Put authorization in API routes and scope helpers, then mirror capability in UI.
4. Generate a Drizzle migration for schema changes; never edit an applied migration.
5. Add focused tests for protocols, RBAC, lifecycle, rendering, and public validation.
6. Run generated-type, TypeScript, test, Worker-build, and proportional Playwright checks.
7. Update `.agents/STATUS.md` when behavior, prerequisites, or gaps change.

## Engineering Rules

- TypeScript strict; avoid `any`, ignored errors, and unchecked production casts.
- Keep Cloudflare runtime code Web API-compatible and use current Workers binding types.
- Business tables mostly lack foreign keys, so delete endpoints preserve integrity explicitly.
- Public ToC routes require identity validation, D1 rate limits, and Turnstile where configured.
- Treat Turnstile as a paired frontend/backend feature: configure the secret and public site key together, and fail closed when only the backend secret is present.
- Reverse-proxy integration is a path contract, not a CORS feature: preserve `/support`, keep ToB paths denied, and route prefixed static assets through the Worker `ASSETS` binding.
- Treat product Identity Resolver URLs as SSRF sinks and credentials as secrets. Use fragment-held opaque credentials, sealed D1 secrets, bounded HTTPS fetches, strict response schemas, and minimal-claim customer JWTs.
- Keep theme state consistent across SSR and hydration: read the validated theme cookie on the server, emit the matching `html` class/color-scheme, and keep the pre-paint fallback side-effect-free and identical to the client preference order.
- Secrets stay in Wrangler secrets or `.dev.vars`; responses expose presence flags or one-time plaintext.
- Use shared renderers and parsers wherever preview and execution must match.
- Treat empty successful provider payloads as protocol failures. Normalize MIME text before choosing it, and fall back to usable HTML when the plain part is blank.
- Keep SLA calculation in `src/lib/tickets/sla.ts`; API writes and read-side overdue queries must share its state semantics.
- Track `pnpm-lock.yaml`. pnpm 11 dependency overrides belong in `pnpm-workspace.yaml`, should be as narrow as possible, and require a full reinstall, audit, tests, and Worker build.
- Generate `CloudflareEnv` with `pnpm cf-typegen`. Keep `wrangler.types.env` value-free and never hand-write binding interfaces.
- Do not present placeholder processing as complete.

## Verification Gates

Run the normal CI gates in order:

```text
pnpm install --frozen-lockfile
pnpm cf-typegen --check
pnpm lint
pnpm test
pnpm build:worker
```

For a first deployment or binding/schema change, also run:

```text
pnpm exec drizzle-kit check
pnpm exec wrangler d1 migrations apply DB --local --persist-to <fresh-temp-dir>
pnpm exec wrangler deploy --dry-run
pnpm exec wrangler check startup
pnpm audit --prod
```

Remove the generated `worker-startup.cpuprofile` after recording the result. None of these commands authorizes a deploy or remote migration.

## Commit Convention

Use `xxx(comp): desc` with an imperative lowercase description:

```text
feat(ai): add cohere embedding adapter
fix(rbac): scope assistant ticket context
style(tob): tighten management panel spacing
docs(agents): record vectorize prerequisites
test(email): cover custom template escaping
```

Allowed types include `feat`, `fix`, `style`, `refactor`, `test`, `docs`, `chore`, `perf`, and `ci`. Keep one concern per commit. Do not commit unless explicitly requested.
