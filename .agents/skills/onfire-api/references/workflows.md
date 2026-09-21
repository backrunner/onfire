# Operational constraints

Read live operation schemas using `operations <id>`; these examples describe intent,
not a substitute for the deployed API contract.

## Tickets

- `list_tickets` is paginated (`query.page`, `pageSize` up to 100). It can search and
  filter visible products, teams, statuses, priorities and overdue tickets.
- `get_ticket` includes internal notes and original/translated customer content.
  Do not disclose the internal material in a customer response.
- `reply_ticket` sends a public reply (`internal:false`); `add_ticket_note` requires
  `internal:true`. Public replies can invoke translation and outbound email.
- `assign_ticket` is for the first assignment. `reassign_ticket` is separately
  granted and requires a current team member; Agents additionally require their
  team's live reassignment policy. Resolve candidates with `list_team_agents`.
- `update_ticket_status` accepts processing/replied. Replied requires an existing
  public agent reply. Closing, reopening and escalation use dedicated operations.
- Closed tickets accept internal notes but not public replies. Reopening restarts
  reply SLA for assigned tickets; priority and assignment changes preserve the
  server's SLA rules.
- Bulk status/close/assignment accepts up to 100 ticket IDs; already assigned rows
  additionally require `reassign_ticket`. Inspect every per-item result. A 409 means
  state changed concurrently; reload before deciding whether to retry.
- Inline image upload accepts PNG/JPEG/GIF/WebP ≤5 MB; SVG is rejected. Its URL is
  publicly accessible under an unguessable key, including to email clients.

## Products, types and forms

Product lifecycle (create/delete) and settings are separate permissions. Product
administrators can configure assigned products but cannot create/delete products.
Associations must stay within one tenant, including for SuperAdmin.

Ticket types form a three-level tree. Read the type and existing form before editing.
Every saved form version is immediately published and immutable. Copying a historical
version publishes a new version; invalidating a previous version is irreversible and
requires a reason. Type/form archive preserves historical tickets. Form field keys,
option values, conditions and metadata are language-neutral. Author base text in the
product default language; place translations in display-only `*I18n` companions.

## Staff, email, notifications and AI

Staff administration follows live system/tenant/product role boundaries. Granting
user/role, credential, webhook-secret or product-key operations can establish further
access and should match the user's intended administrative scope.

Email configuration and product notification rules/requirements belong to products.
Receiving endpoints belong to the current user; product admins cannot retrieve other
users' stored endpoint secrets. Test and release operations can send real messages or
create real tickets. Product-key issuance permits creating customer identities for
that product, but never ToB access.

AI credentials are managed separately from task routes. Read scope, credential IDs
and models before saving a route. Omit apiKey/secret fields to preserve stored values.
TypeSafe Jev supports prescreening decisions only, not translation, generation,
embedding or reranking. Multilingual products require a usable translation route;
knowledge embedding/reindexing can consume the configured provider's quota.

Document upload stores a source file. Automatic PDF/DOC extraction/indexing is not
implemented; do not promise searchable knowledge merely because upload succeeded.
Use knowledge-entry operations for supported editable knowledge.
