# OnFire UI Review Guard

Apply this guard when implementing or reviewing OnFire UI changes. Use
`.agents/DESIGN.md` for the design patterns and `.agents/DEVELOPMENT.md` for the
development workflow.

## Information Hierarchy

- Inspect changed UI markup and locale strings for middots or bullets used to
  concatenate metadata, such as a ticket number, customer, product and time.
  Check rendered output too: separators can come from entities or composed
  strings. A remaining metadata chain is an actionable review finding.
- Choose the structure by meaning rather than substituting punctuation:
  use label/value groups for resource fields; separate action, actor/details and
  timestamp for activity; use small semantic badges for state, language, level
  and version; use natural sentences for prose. Do not introduce pipes, slashes,
  arbitrary icons or extra cards merely to replace dots.
- Prefer the shared `MetadataList`/`MetadataItem` definition-list primitives.
  Keep ticket numbers in a stable, prominent position and timestamps secondary.
  Each filter keeps a visible field label when its selected value changes.
- On narrow screens, wrap field groups as units and allow long values to wrap.
  Do not truncate an entire audit entry into one unreadable sentence. A compact
  picker may truncate a selected label while its menu retains the full value.

## Scope And Verification

- Preserve legitimate list markers, password masks, semantic status indicators
  and user-authored content. This is a review of presentation meaning, not a ban
  on every dot character or a reason to alter persisted customer content.
- Inspect affected flows at 1440x900 and 390x844 in English/Chinese and
  light/dark when supported. Include long labels, names, email addresses and
  relevant loading, empty and error states. Check page overflow, field-label
  visibility, badge contrast and readable activity details.
- Source search helps locate candidates; it does not replace rendered review.
  Report unresolved issues with their file/line and user impact. Accept a UI
  change only after the affected metadata satisfies the hierarchy checks, or
  after documenting a user-authorized exception.
