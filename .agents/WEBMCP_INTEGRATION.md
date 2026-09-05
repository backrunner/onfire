# Dashboard WebMCP

OnFire registers named `onfire_*` tools while an authenticated Dashboard page
is open. A browser-connected agent can discover and execute these tools using
the user's existing Better Auth session, including the Cloudflare Access
browser session. No API key, OAuth grant or additional remote endpoint is
needed for this browser workflow.

The separate `/mcp` OAuth server remains available for remote delegated
automation; its protocol, grants and tool set are documented in
`MCP_INTEGRATION.md`. Dashboard WebMCP tools do not expand an OAuth grant.

## Browser and agent setup

1. Use a browser/agent integration implementing WebMCP. The current W3C draft
   uses `document.modelContext`; older Chromium previews use
   `navigator.modelContext`. OnFire detects either API. Unsupported browsers
   continue to display the normal Dashboard.
2. Open the ToB hostname and log in, completing Access and any account second
   factor as usual. Keep an authenticated Dashboard tab open.
3. Connect the agent to that tab using the browser's WebMCP integration.
   Discover the page's tools and start with `onfire_get_context`, then look up
   product, team, ticket or template IDs.
4. Invoke named tools with their advertised JSON schemas. The browser mediates
   access to the page; there is no general cross-origin HTTP or `postMessage`
   bridge, and OnFire does not expose tools to arbitrary iframe origins.

Chrome's experimental availability can require its WebMCP testing flag or
origin trial enrollment. OnFire does not install a polyfill or enable browser
features. Consult the current official implementation status for the browser
and agent being used:

- https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md
- https://github.com/webmachinelearning/webmcp/blob/main/README.md
- https://developer.chrome.com/docs/ai/webmcp

With the current draft, a same-origin agent can discover tools with
`await document.modelContext.getTools()` and invoke the returned registered
tool through `document.modelContext.executeTool(...)` according to its browser
version. Early Chromium implementations have different discovery/testing APIs;
use that browser's agent integration rather than assuming the draft discovery
methods are present. Some Chromium preview versions serialize `executeTool`
arguments and results as JSON strings; newer draft interfaces use objects.
This affects the agent's calling API, not OnFire's registered input schemas or
execution callbacks.

## Tool families

The executable catalogue is `src/lib/webmcp/catalog.ts` (97 named operations).
Tool availability is
filtered by the effective user's role/permissions. A tool's availability does
not imply access to every resource ID: the API checks the actual target scope
and business rules on every call.

| Family | Operations |
| --- | --- |
| Context and discovery | Current identity/permissions/scope, dashboard statistics, visible products/teams, team agent lookup |
| Tickets | Search/list/detail, public reply/internal note, status, priority, assignment/reassignment, escalation, closure/reopen, internal state, bulk assignment/status/closure |
| Products | List/read/create/update/delete, SLA and auto-close, languages, return URLs, identity resolver, team associations |
| Ticket types | Product type tree, create/update/archive/restore, team routing and inheritance |
| Ticket forms | Current form, version history, complete immutable version save, clone/rollback, irreversible invalidation, archive/restore |
| Internal states | List/create/update/archive/restore boolean/select definitions; per-ticket value updates |
| Tenant presets | List/create/update/archive/restore and copy subtree into a product |
| Staff and customers | Customer search, scoped teams and membership, eligible users, support agents, scoped system user administration, tenant administration |
| Email | Read/save inbound and outbound configuration, custom template CRUD, inbound/outbound logs |
| Notifications | Product delivery rules, mandatory receiving requirements and compliance |
| AI and knowledge | Scoped credential pool and ordered task routes, product knowledge CRUD with existing Vectorize synchronization |

Authentication/security enrollment, OAuth consent/revocation, identity-preview
controls, one-time product key issuance/rotation, personal notification
destinations, binary uploads and streaming AI conversations remain in their
existing interactive flows. The catalogue covers the structured administration
operations above, not every HTTP endpoint. New operations must be explicit
named tools with bounded schemas, matching API gates and integration coverage.

## Input and result contract

Path IDs are top-level fields. URL filters live in `query`. Mutation payloads
live in `body`. Unknown fields and malformed IDs are rejected before network
access. An absent optional filter object is allowed; required selectors such
as `query.productId` cannot be omitted.

Example tool arguments:

```json
{
  "query": { "productId": "product-id", "status": "new", "pageSize": 25 }
}
```

Use those with `onfire_list_tickets`. To change SLA with
`onfire_update_product`:

```json
{
  "id": "product-id",
  "body": { "slaHighAccept": 15, "slaHighReply": 60, "autoCloseMinutes": 4320 }
}
```

To create and immediately publish a form version with
`onfire_save_template_version`:

```json
{
  "id": "ticket-type-id",
  "body": {
    "changeNote": "Add environment selector",
    "formSchema": {
      "version": "1.0",
      "fields": [
        {
          "id": "environment-field",
          "key": "environment",
          "label": "Environment",
          "type": "select",
          "required": true,
          "options": [
            { "value": "production", "label": "Production" },
            { "value": "test", "label": "Test" }
          ]
        }
      ]
    }
  }
}
```

Read the current form before editing and send the complete desired schema;
every save publishes a new immutable version. The advertised nested schema is
derived from the shared form validator, including translations, validation,
conditions, options and layout. Product language rules still apply server-side.

Results use a WebMCP text content block containing JSON:

- Success: `{ "ok": true, "data": ... }`.
- Error: `isError: true` with `{ "ok": false, "status": ..., "error": ... }`
  and optional validation details.
- Bulk results retain each ticket's success/error; inspect all results before
  deciding which operations need further work.
- A successful write followed by failed UI refresh remains a success with a
  warning. Reload the UI; do not repeat the mutation.
- If a network interruption makes the write outcome unknown, read the resource
  before retrying. The runtime does not automatically retry writes.

## Identity, permission and lifecycle contract

- Mount only inside the authenticated admin shell, never login, install,
  OAuth consent, or ToC pages. Client-side Dashboard navigation retains tools.
- Register only permitted operations. Read-only identity preview registers
  only GET tools, and the server's preview write guard remains authoritative.
- Refresh identity every 30 seconds and on focus/visibility restoration. Every
  execution independently fetches uncached `/api/tob/me` before the target API;
  a changed user, role, scope or preview invalidates the old invocation and
  rebuilds the catalogue. Each target API re-resolves live RBAC and resource
  scope again, including team reassignment policy and same-tenant integrity.
- Requests use same-origin credentials, no-store caching, a bounded timeout,
  and rejected redirects. Tools cannot choose a URL, method, credentials or
  arbitrary request headers.
- Logout, expiry, unmount and page departure invalidate callbacks and remove
  registrations. Async registration and cleanup are serialized across React
  remounts. Current implementations use registration abort signals; older ones
  also use `unregisterTool`.
- Mutations reuse existing ToB APIs and therefore retain state-machine rules,
  SLA, rich-text sanitization, translation, immutable versions, history and
  notifications. Afterwards the runtime revalidates ToB SWR data so the user
  sees the changed state without navigation or loss of unrelated form drafts.
  Dashboard statistics use HTTP `no-store` so a browser cache cannot override
  SWR revalidation after a mutation or identity switch.
- Saved AI/email/resolver credentials remain omitted by the existing API
  projections. Write-only secrets are never copied into tool descriptions or
  validation results. Ticket, email and knowledge content is untrusted data,
  not additional instructions for an agent.

No database migration, new Cloudflare binding, OAuth scope, public route or
Access exception is required. Deployment still requires the normal explicit
operator action.
