# Open-source readiness review

Review date: **2026-09-09**

Revision reviewed: `f1523a3` plus the follow-up site cleanup commit.

### CI recovery follow-up — 2026-09-09

The application dependency update resolves the nine production audit findings
below and the development-only js-yaml advisory. Next.js 16.3.4, OpenNext 1.20.6,
Wrangler 4.125.0, aligned Tiptap 3.30.5 packages, Vitest 4.1.11, Hono 4.13.7,
Sharp 0.35.4, and scoped js-yaml 4.3.2 pass both full and production audits.
The installed dependency-license inventory has been regenerated.

Gitleaks identified one false positive in ordinary configuration prose from a
deleted generated svedocs reference. A documented, exact historical fingerprint
in `.gitleaksignore` excludes only that finding; CI still scans the complete Git
history. Local scanning covers 150 commits with no remaining findings.
Frozen install, binding/type checks, all 705 tests, both Worker builds, fresh
local migrations, deployment dry-run/startup profiling, and desktop/mobile
editor browser checks pass. These results supersede the dependency-audit
blocker recorded in the earlier website-theme review.

### Website theme follow-up — 2026-09-09

The new standalone site theme retains Apache-2.0 attribution and ships its local
font/icon notices and generated bundle licenses. Its frozen install, type check,
16-page bilingual content check, and static build pass. Scoped overrides update
the site's Sharp to 0.35.4 and cookie to 0.7.2; its production dependency audit now
reports no known vulnerabilities.

At the time of the theme review, the application passed type generation,
TypeScript, 92 test files / 705 tests, and both Worker builds, while its
production lockfile audit reported 9 advisories: 2 critical, 2 high, and 5
moderate. The affected packages and reported fixed minimums were
Next.js 16.3.3, Sharp 0.35.4, Hono 4.13.5, Tiptap core 3.30.5, and Vitest/mocker
4.1.11. The CI recovery above supplies the tested application dependency update.
The theme release itself changed only the independent static site's runtime
dependencies and did not deploy the application or email Workers.

This is a repository and distribution review, not a legal opinion or a security
assessment of a deployed service.

## Ready in the worktree

- `LICENSE` contains the unmodified Apache License 2.0 text.
- `package.json` declares `Apache-2.0`; `NOTICE` names the project copyright and
  points to third-party notices.
- `README.md` and `README.zh-CN.md` describe the shipped architecture, setup,
  integrations, current limitations, and Cloudflare deployment model.
- `apps/site` contains the bilingual svedocs landing and handbook. Its static
  build is isolated from the Next.js Worker and uses the same Apache 2.0 notice
  and repository links.
- `docs/DEPLOYMENT.md` documents the two-Worker mail arrangement, required
  bindings, queues, migrations, domain separation, Access exceptions, secrets,
  and deployment order.
- `CONTRIBUTING.md`, `SECURITY.md`, and a pull-request template provide the basic
  maintainer and contributor workflow.
- Public Wrangler and environment examples use placeholder domains, addresses,
  product IDs, and D1 IDs. The operator's prior configuration is ignored locally
  rather than shipped in the public templates.
- `THIRD_PARTY_NOTICES.md`, `docs/licenses/lucide.txt`, and
  `docs/dependency-licenses.json` preserve the relevant dependency attribution.
  The inventory includes installed optional/native packages and records its host
  platform. Regenerate it after dependency changes.
- CI has read-only repository permissions, a full-history Gitleaks scan, frozen
  install/type generation/type checking/tests/Worker build, and a production
  dependency audit.

## Evidence collected

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass |
| `pnpm cf-typegen --check` | Pass |
| `pnpm lint` | Pass |
| `pnpm test` | Pass — 92 files, 703 tests |
| `pnpm build:worker` | Pass — application and email-agent dry-run bundles |
| `pnpm exec drizzle-kit check` | Pass |
| Fresh local D1 migrations and `PRAGMA foreign_key_check` | Pass — migrations `0000` through `0029` |
| `pnpm exec wrangler deploy --dry-run` | Pass against the example configuration |
| `pnpm exec wrangler check startup` | Pass — generated profile removed afterward |
| `pnpm audit` / `pnpm audit --prod` | Pass — no known vulnerabilities in the reviewed lockfile |
| Gitleaks current publication candidate | Pass |
| Gitleaks Git history (`--all --full-history`) | Pass — 141 commits, no findings |
| `pnpm --dir apps/site check` | Pass — 0 errors, 0 warnings |
| `pnpm --dir apps/site check:content` | Pass — 16 pages, 0 errors, 0 warnings |
| `pnpm --dir apps/site build` | Pass — static svedocs output |
| Clean-checkout install/seed smoke | Pass — local D1, demo seed and 12 sample tickets |
| Sequential local dev smoke | Pass — ToB and ToC health endpoints returned 200 |

The local Vectorize warning is expected: Cloudflare does not provide a local
Vectorize emulator. Provider APIs, Cloudflare Email Routing/Sending, queues, and
Access need deployment-level integration checks.

## Publish blockers and decisions

These require the repository owner to decide or execute before changing the GitHub
repository to public:

1. **GitHub visibility is still private.** Change it in repository settings only
   after reviewing the current worktree and history. The GitHub API reports
   `backrunner/onfire` as `private`; no visibility change was made by this task.
2. **History contains deployment metadata.** The current files use examples, but
   earlier commits contain the former Alkinum hostnames, a Cloudflare account ID,
   a D1 ID, and product-specific email configuration. Secret scanning found no
   credentials. Decide whether those identifiers are acceptable historical
   metadata; if not, rewrite history and rotate/reissue any associated resources
   before making the repository public. Do not rewrite history casually.
3. **Package publication is intentionally disabled.** `package.json` retains
   `private: true`, which is appropriate for this deployable application and
   prevents accidental npm publication. Remove it only if the maintainers decide
   to publish a package with a separate API/versioning and release policy.
4. **Maintainer identity and contact.** Confirm that `BackRunner`, the
   copyright year, `dev@backrunner.top`, and the GitHub organization are the
   identities the project wants to publish. Add a CODEOWNERS file and a code of
   conduct when the maintainer policy is decided.
5. **Third-party review.** The inventory identifies native LGPL/MPL and data
   attribution obligations. If releases distribute a Docker image, prebuilt
   Worker artifact, or native package, have the release owner verify that the
   corresponding source/notice/relinking requirements are shipped. Apache-2.0
   covers OnFire's own code and does not relicense dependencies.
6. **Cloudflare resources and costs.** A public repository does not provide free
   D1, R2, Queues, Vectorize, Email, AI, or notification services. Set account,
   billing, retention, rate limits, provider terms, and data-processing notices
   for each deployment. Never copy the historical production resource IDs into a
   new installation.
7. **Deployment secrets and data.** Before publication, independently inspect
   ignored local files, editor history, CI secrets, Cloudflare dashboards, and
   backups. This worktree scan cannot inspect external stores. Rotate anything
   that was ever exposed outside the current secret stores.
8. **Trademark and content review.** Confirm that the OnFire name, logo/banner,
   provider marks, screenshots, seeded content, and documentation examples may be
   redistributed. Apache-2.0 does not grant trademark rights.

## Maintainer publication sequence

1. Review this report, the complete Git diff, and all prior commits; resolve the
   history decision above.
2. Confirm domain/resource placeholders, contact details, third-party notices,
   and the data-processing/deployment policy.
3. Run the CI workflow on the exact commit to be published. Enable GitHub private
   vulnerability reporting or provide an equivalent private intake channel.
4. Configure branch protection and CODEOWNERS if the project will accept outside
   pull requests. Keep repository Actions permissions minimal.
5. Change repository visibility to public in GitHub settings, verify the public
   repository page and license detection, then check that Actions secrets and
   environments remain private.
6. Publish a tagged release only after a real deployment owner has separately
   validated Cloudflare resources, migrations, Access, email queues, and provider
   data handling.

No deployment, remote migration, GitHub visibility change, history rewrite, or
commit was performed during this review.
