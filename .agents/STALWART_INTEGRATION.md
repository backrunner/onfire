# Stalwart integration

Select **Stalwart** as the product's inbound provider, set the mailbox address,
save, and generate a webhook secret. The endpoint paths shown in Email settings
must be prefixed with the public ToC origin (`https://support.alkinum.io` for
this deployment).

## MTA Hooks: ticket intake

Configure a Stalwart MTA Hook:

- URL: `https://support.alkinum.io/api/toc/webhooks/stalwart/PRODUCT_ID/mta-hook`
- Stage: `data` only
- HTTP authentication: Bearer, with the product's generated webhook secret
- Temporary failure on endpoint error: enabled
- Timeout: allow sufficient time for configured AI filtering and translation
- Restrict the hook to the product's inbound recipient where possible

The native request contains `context`, `envelope`, and `message`. Stalwart sends
MIME headers separately from `message.contents`; OnFire rebuilds and parses the
message, retaining decoded text/HTML and thread headers. Only the configured
product recipient is processed, even if the SMTP envelope contains multiple
recipients. SMTP envelope sender identity is preserved. Null-envelope bounce
messages and non-DATA stages are acknowledged without creating tickets.

On success, OnFire returns the native top-level `{"action":"accept"}` so
Stalwart continues normal mailbox delivery. OnFire quarantine does not discard
the entire SMTP transaction. Processing failures and pending concurrent
deliveries return HTTP 503 so Stalwart can retry. A completed delivery is
deduplicated using Message-ID; messages without it use a stable content hash.

The raw message limit is 10 MiB. Decoded plain text is limited to 500,000
characters and HTML to 1,000,000 characters. Ordinary attachments are not
persisted, and `cid:` inline images follow the existing sanitizer rules.

## Telemetry Webhooks: event acknowledgement

Configure a Stalwart Telemetry Webhook:

- URL: `https://support.alkinum.io/api/toc/webhooks/stalwart/PRODUCT_ID/events`
- Signature key: the product's generated webhook secret
- Events: the desired `message-ingest.*`, `delivery.*`, or `smtp.*` events

Stalwart event selection may require listing exact event names, rather than
wildcard patterns. The endpoint accepts Stalwart's native `{"events":[...]}`
batch and verifies `X-Signature` as Base64 HMAC-SHA256 over the exact request
bytes. Bearer authentication is also accepted. It returns accepted/ignored
counts and writes counts by event type to Worker observability logs. These are
receipt counts, not unique-delivery metrics: retries can repeat them. Configure
product-specific event filtering in Stalwart where available; the endpoint
does not infer product ownership from opaque account/document IDs. It does
not store event payloads in D1 or expose them in the product email log.

Telemetry events contain metadata, not the full MIME body. They do not create
tickets or alter ticket state; use the DATA-stage MTA Hook for intake. No
Stalwart API credential, remote body fetch, or mailbox polling is required.

## Verification

The adapter is covered by 14 integration tests against migrated local SQLite,
including native MIME parsing, scoped credentials and recipients, threading,
sanitization, duplicate/retry behavior, and native telemetry signatures. The
existing inbound regression set totals 50 passing tests. This is protocol and
local pipeline verification; a live Stalwart server has not been connected.

## References

- https://stalw.art/docs/mta/filter/mtahooks/
- https://stalw.art/docs/telemetry/webhooks/
