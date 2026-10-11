# Page rendering and loading

Updated: 2026-10-11

## Rendering and data ownership

The authenticated admin layout resolves the browser session, live role and
resource scope on the server. `getAdminContext` uses React's request cache so
the layout and page share one context within a render. It applies the same
signed preview cookie and live target checks as the APIs.

The layout seeds `/api/tob/me` into a private SWR provider. Its identity key
includes the user, role, permissions, tenant/product/team membership and preview
actor/target. Preview changes clear client data and refresh the server tree.
There is no persistent server cache for authenticated business data.

Dashboard statistics and recent tickets, the initial filtered ticket list, and
the first customer-directory page render through services also used by their
existing APIs. Ticket rows and product/team filter metadata load concurrently.
SWR still revalidates business data after hydration, focus and reconnect, and
mutations refresh affected views. Metadata reads share a 60-second deduplication
window and do not revalidate on every focus. API authorization remains live.

The ticket workspace requests `summary=true`. Summaries contain the fields used
by list rows and omit bodies, form metadata, translation maps and AI output.
Search and scope predicates remain identical to full reads; the default REST
response remains unchanged. Detail reads load full content on selection. D1
batch projections give synthetic empty/NULL columns unique SQL aliases to
preserve timestamp and SLA column mapping.

UTC timestamps are included in server HTML with an explicit timezone label.
Hydration first matches that HTML and then displays browser-local time. The
server passes only the selected language dictionary. The alternate dictionary
loads when the user switches languages; the cookie survives reloads.

## JavaScript and navigation

- Sidebar, Dashboard and customer-directory navigation prefetch on pointer
  hover or keyboard focus. The header prefetches search on focus and individual
  suggestions on intent. Opening one page no longer prefetches all destinations.
- The workspace loads ticket detail and bulk actions when they appear. Closed
  preview and AI dialogs do not load their implementations at startup.
- The header loads the Better Auth client on logout instead of including it in
  the shared admin shell.
- WebMCP checks browser support before loading its runtime and validation code.
  Supported browsers retain registration, live identity checks, refresh after
  mutations and departure cleanup.

## Production Worker compatibility

OpenNext 1.20.10 does not include Next 16.4's `preview-props.json` in its manifest
inlining glob. A production Worker could build successfully and still return
HTTP 500 on a page request. The pinned pnpm patch in
`patches/@opennextjs__cloudflare@1.20.10.patch` adds this file to the existing
manifest loader. Frozen installs apply it reproducibly.

After changing Next or OpenNext, verify actual authenticated HTTP responses in
the built Worker as well as compilation and deployment dry-run. Remove the
patch when the installed adapter handles this manifest itself.

## Measured comparison

The baseline is commit `9a69f51`, using the same dependency versions, with the
manifest compatibility fix applied solely to allow its production Worker to
run. Both builds used identical synthetic accounts and 31 tickets in separate
local D1 snapshots. Each route opened in a fresh Chromium context at 1440×900,
Chinese/dark mode, Asia/Singapore timezone, without CPU/network throttling.
Requests were collected through network idle plus one second. All page and API
responses used in the final comparison succeeded and displayed fixture data.

The following values sum `PerformanceResourceTiming.encodedBodySize` for JS
requests, including prefetches initiated during that window. Values are decimal
KB; local asset responses are uncompressed. These are initial navigation loads,
not the total size of every code chunk available to a page.

| Page | Before JS | After JS | Reduction | Browser API reads before → after |
| --- | ---: | ---: | ---: | ---: |
| Dashboard | 702.0 KB | 244.5 KB | 65.2% | 2 → 1 |
| Tickets | 702.0 KB | 254.9 KB | 63.7% | 4 → 3 |
| Account | 726.9 KB | 264.9 KB | 63.6% | 5 → 4 |
| Management | 706.9 KB | 261.6 KB | 63.0% | 3 → 2 |
| Customers | 702.0 KB | 253.4 KB | 63.9% | 3 → 2 |

For the same 25-row fixture page with 4 KB ticket bodies, the decoded REST
response decreased from 117,438 bytes to 5,787 bytes with summaries (95.1%).
The full response remains available to existing API consumers.

Dashboard and ticket rows were absent from baseline server HTML and present in
the new HTML. Blocking all external application JS still displayed Dashboard
statistics and tickets. Server-rendered data and the selected dictionary
increase HTML size while reducing executable JS; local timings are sensitive
to Worker startup and are not a Cloudflare/WAN latency guarantee. Account and
management business reads remain client-side; they benefit from server identity
and the lighter shared shell.

## Verification

- Frozen install, generated binding check, TypeScript, production main Worker
  build and email-agent dry-run passed.
- A clean candidate containing only this task's changes passed 98 test files /
  832 tests. The shared working tree passed 838 tests, including unrelated work.
- Five role-specific regression cases preserve full-list scope, ordering and
  counts for summaries, verify timestamp/SLA fields and excluded private
  content, and compare payload sizes.
- Production Chromium checks covered Dashboard, filters, lazy detail/editor and
  customers in English/Chinese, light/dark, at 1440×900 and 390×844. They verified
  no horizontal overflow, aligned content edges, local timestamps, language
  switch/reload, preview scope and blocked preview writes, and WebMCP cleanup.
  Logout loaded its deferred authentication client and invalidated the session.
  Eight additional production-browser cases covered the customer portal with
  a local two-language product in the same language/theme/viewport matrix.
- All 33 migrations applied to a fresh local D1 directory. Main Worker dry-run,
  local startup profiling and production audit passed; production audit found
  zero advisories. Local startup profiling is not a remote startup measurement.

Local logs, isolated fixtures, browser harnesses and screenshots are saved under
the ignored `.cache/onfire-performance-qa` directory. This verification did not
deploy Workers, modify production data or deliver mail/paid AI requests.
