---
title: Account security
description: Protect dashboard login with Passkeys, TOTP and bounded attempt limits.
order: 10
---

## Authentication and personal settings

ToB uses Better Auth browser sessions. Account security opens one settings modal
for password changes, Passkeys and authenticator TOTP. Passkeys are bound to the
exact `BETTER_AUTH_URL` hostname/origin, so keep that canonical configuration
consistent with the deployed admin domain. Users manage only their own Passkeys.

TOTP enrollment requires the current password and verification of the first code.
Password sign-in for an enabled account must complete the second-factor challenge.
Recovery codes are displayed only on generation; changing/disabling TOTP or
regenerating codes requires the current password. Trusted-device state lasts
30 days. Preserve recovery access before replacing a device.

## Login protection

D1-backed controls execute before authentication: 30 requests/IP/minute,
100 requests/IP/15 minutes, and 10 normalized-email password attempts/15 minutes,
including successful attempts. Unknown emails follow the same policy. Account
buckets use HMAC keys rather than raw email. TOTP/recovery attempts share the
Better Auth 10-failure/15-minute account lockout.

Limiter failure rejects authentication. HTTP 429 includes `Retry-After`; bounded
bodies and non-cacheable responses apply. The maintenance cron purges expired
login counters. These controls complement Cloudflare Access, not replace it.

## Other credential types

[Account API keys](/docs/guides/account-api-keys) are explicit REST credentials;
[MCP OAuth](/docs/guides/automation) has separate delegation. Browser logout does
not revoke either. Revoke account keys and connected applications separately.
Preview, account bearer keys and MCP tokens cannot operate personal security or
mint account keys. [Product keys](/docs/guides/customer-portal) are ToC-only.
