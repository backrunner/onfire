---
title: Ticket types and forms
description: Author product-owned type trees, immutable forms and internal states.
order: 7
---

## Type tree and routing

Create types within one product, up to three levels. A parent type can remain
selectable even when it has children, provided it has an active current form.
Customers choose the type, not a template or version. Routing uses the nearest
routed ancestor, then the tenant default team; a routed team must belong to the
same tenant and be available to the product.

Each product has a hidden `unclassified` fallback for valid inbound messages
without a confident type selection. It is not customer-selectable or deletable.
Tenant administrators can author reusable preset trees; product administrators
copy an active subtree into a product. Copies have no live preset linkage.

## Immutable versions

A type owns at most one form series. Every save creates the next version and
makes it current immediately; there is no draft/publication stage. Field keys,
option values, validation and conditions form the submission contract.

Previously current versions remain valid for already-open customer forms until
explicitly invalidated. Invalidation is irreversible and needs an audited reason;
the active current version cannot be invalidated. Reverting a form means copying
an earlier version into a new version, not editing an old row.

Tickets pin the selected type ID, submitted form version and type-path snapshot.
Renaming, moving or archiving configuration never rewrites historical rendering.
Archive/restore replaces physical deletion. A parent with active children cannot
be archived, and archived types/forms are not offered for new submissions.

For API intake, send `ticketTypeId`, `templateVersionId`, subject, content and the
form's `metadata` values. The server checks product ownership, version validity,
required fields and conditions before routing or persistence.

## Internal operational states

Boolean or finite-select states belong to one exact product type. They are ToB-only,
not customer form metadata. Every ticket-state value change writes an
`internal_state_changed` history record. Archiving a definition preserves old
values for reading but prevents further changes using that definition.

Use [product languages](/docs/guides/languages) to translate display labels without
changing keys, values, conditions or historical submissions.
