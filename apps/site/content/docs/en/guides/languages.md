---
title: Product languages and translation
description: Keep authored text, originals and customer-facing translations distinct.
order: 8
---

## Product configuration

Products support English and Chinese. The supported set must include the authored
content default language. Enabling more than one language requires an effective
Translation AI route. After the first non-system ticket type is authored, the
product default language cannot change.

Type and form base fields use that default language; `*I18n` companions contain
only display text. Field keys, option values, conditions and submitted metadata
stay language-neutral. Tenant presets use English base text; copying them rebases
text to the destination product's default/supported languages.

## Portal resolution

Content language is resolved in this order: explicit `?lang=`, `onfire-lang`
cookie, supported `Accept-Language`, then product default. The switcher exposes
only supported languages and is hidden for a single-language product. Switching
language preserves a selected type and compatible form draft values.

## Stored originals and required translation

Ticket/reply base columns preserve the author's original. Translation maps are
cached separately. Valid web/email ticket intake completes required translation
before insertion, after validation and filtering. Public customer, ToB, email and
MCP replies also complete required translation before they are stored. Translation
failure returns/reports an error rather than persisting an untranslated substitute.
Internal notes never invoke customer-facing translation.

Customer APIs project one resolved language only: no translation maps, alternate
originals, detected-language metadata, internal notes or AI fields. ToB keeps
originals available for audit and can disclose the customer's translated reply.
Outbound email reuses the stored customer-language projection rather than paying
for a second translation.

The dashboard's English/Chinese interface preference is separate from a product's
authored language. Changing the interface does not rename authored keys or rewrite
historical content.
