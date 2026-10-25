---
title: Spam filtering and interface specifications
description: Verify genuine support intent and integrate decision or custom filtering APIs.
order: 6
---

OnFire filters for **genuine support communication**, not just conventional spam.
Reject promotions, sales or partnership outreach, phishing, unsolicited bulk mail,
automated noise, gibberish, meaningless filler and unrelated messages. A genuine
problem report, question, complaint, feature request or meaningful product feedback
is valid even when brief, emotional or quoting malicious content as evidence.
For existing tickets, relevant follow-up, requested details, resolution confirmation
and thanks are valid. A ticket marker by itself is not evidence of genuine intent.

## Configuration

Apply migrations `0034_decision_spam.sql` and `0035_genuine_support_label.sql`.
Add a TypeSafe, Hugging Face or Decision HTTP credential to **AI Spam Filter**
in AI function routing, then select **AI decision model** in global or tenant
Spam Filter settings. Keys are encrypted; routes inherit product → tenant → system
and support ordered failover. No model is enabled automatically.

The gate applies before new customer tickets and customer replies are inserted,
including web/API submissions and inbound email. Internal staff notes and replies
are outside this customer intake gate. Disabled spam settings skip the gate.

Both adverse probabilities are evaluated: `score = max(spamProbability,
1 - supportProbability)`. A message can pass only when `spamProbability < 0.5`
and `supportProbability > 0.5` and the score is below the suspect threshold.
The configured thresholds default to spam `0.9` and suspect `0.5`; the former
separates clear rejection from uncertain rejection, not rejection from admission.
**Both spam and suspect are blocked.** Email goes into the existing quarantine
for manual review/release. Web/API clients receive HTTP 400 without a ticket or
reply being created. Exhausted routes, invalid model responses and verification
outages hold email for review and return HTTP 503 to web/API clients.

## Review and restore filtered inputs

Apply `0036_filtered_inputs.sql` before deploying this feature. System and tenant
spam settings show inputs filtered in the last 30 days, including email quarantine
and retained web/API tickets and replies. Administrators with `spam.config` can
review only their live product/tenant scope; preview mode is read-only. Review
preserves original text, submitted fields and filtering evidence. Remote images
load only when explicitly opened and send no referrer.

To restore a false positive, enter a review reason. New email also requires an
explicit product ticket type. New requests become tickets; matching customer
replies return to their original open ticket. Restoration bypasses the filter
decision only and rechecks customer identity, form/type validity, routing and
translation. Repeated restoration returns the existing result. Older discarded
web/API content cannot be recovered from before this migration.

## Decision API

A commercial or self-hosted decision endpoint must implement **onfire-decision-v1**.
Save its complete public HTTPS prediction URL under Decision HTTP; no suffix is
appended. Its contract is distinct from the custom verdict API below.

OnFire sends `POST` with `Authorization: Bearer <key>`,
`Content-Type: application/json` and `Accept: application/json`.

```json
{
  "protocol": "onfire-decision-v1",
  "model": "support-intent-v1",
  "message": {
    "kind": "reply",
    "subject": "Re: Cannot sign in",
    "content": "Thanks, that fixed it.",
    "fromEmail": "customer@example.com",
    "toEmail": "support@example.com",
    "ticketContext": {
      "subject": "Cannot sign in",
      "latestReply": "Please reset your password and try again."
    },
    "spfResult": "pass",
    "dkimResult": true
  }
}
```

| Request field | Contract |
| --- | --- |
| `protocol` | Exact value `onfire-decision-v1` |
| `model` | Model ID selected in the route |
| `message.kind` | `new` or `reply` |
| `message.subject`, `message.content` | Original text, without silent truncation |
| `message.fromEmail`, `message.toEmail` | May be empty for email-less or web/API customers |
| `message.ticketContext` | Optional, validated product-owned ticket subject and latest public reply; never internal notes |
| `message.spfResult`, `message.dkimResult` | Optional email authentication evidence |

The endpoint must treat message and context text as untrusted evidence, never as
instructions. It returns HTTP 2xx with `application/json` and exactly these fields
(`usage` is optional):

```json
{
  "model": "support-intent-v1.2",
  "spamProbability": 0.01,
  "supportProbability": 0.98,
  "usage": { "promptTokens": 120, "completionTokens": 0, "totalTokens": 120 }
}
```

| Response field | Contract |
| --- | --- |
| `model` | Nonempty resolved model/version, at most 200 characters |
| `spamProbability` | Required finite number in [0, 1]; probability of unsolicited spam/promotion/phishing/noise |
| `supportProbability` | Required finite number in [0, 1]; probability of genuine support communication under the policy above |
| `usage` | Optional nonnegative safe integer `promptTokens`, `completionTokens`, `totalTokens` |

The two probabilities are independent judgments; they need not sum to one.
A low spam probability alone is insufficient: meaningless or unrelated content
must also receive a low support probability. Missing support evidence, numeric
strings, free text and verdict-only responses fail validation and trigger fallback.

Jev uses its native TypeSafe System One API with two independent Noul questions
for spam and genuine support. It does not need an adapter for this contract.

## Classification

Hugging Face uses the native text-classification payload: `inputs` is a JSON string
containing the same contextual `message` fields, and `parameters` requests
`function_to_apply: "softmax"` and `top_k: 256`. Configure an `owner/model` ID and
token. Leave the URL empty for HF Inference, or provide the exact prediction URL
of a dedicated or self-hosted endpoint compatible with this API.

The response is an array of `{ "label": "...", "score": 0.0 }`, optionally wrapped
in one array for one input. Configure **both Spam label and Genuine support label**
using exact, distinct model labels. All class probabilities must be present,
finite and in [0, 1], with unique labels and a total within 0.01 of one.
Unrelated/meaningless classes remain separate from genuine support and contribute
to `1 - supportProbability` even when the spam label is unlikely.

A generic spam/ham, sentiment or toxicity classifier does not establish genuine
support intent. Use a model trained for these classes and this contextual input;
OnFire does not assume that `ham` or `LABEL_0` means a real ticket. Token usage is
not reported by this interface; usage logs retain the request with zero reported
tokens. Native protocols other than these require a Decision HTTP adapter.

## Custom spam API

A custom verdict endpoint uses **onfire-spam-v1**, with the complete HTTPS URL
from Spam Filter settings. OnFire sends `POST` with:

```json
{
  "authorization": "Bearer <secret>",
  "content-type": "application/json",
  "accept": "application/json",
  "x-onfire-spam-protocol": "onfire-spam-v1"
}
```

```json
{
  "messageId": "<mail-id@example.com>",
  "fromEmail": "customer@example.com",
  "toEmail": "support@example.com",
  "subject": "Cannot sign in",
  "content": "My account is locked.",
  "kind": "new"
}
```

Optional input fields are `userIp`, `spfResult`, `dkimResult`, `autoSubmitted`,
`precedence`, `listId`, `returnPath` and `ticketContext` as described above.
Ignore unsupported optional input fields. `messageId` and email fields may be
empty for web/API intake. Response:

```json
{
  "verdict": "spam",
  "score": 0.97,
  "reason": "Unsolicited product promotion",
  "referenceId": "classification-123"
}
```

`verdict` is required and must be `allow`, `suspect` or `spam`. Optional `score`
is a number in [0, 1], `reason` has at most 1,000 characters and `referenceId`
at most 500. Unknown response fields are rejected. Return `allow` only for genuine
support communication; return `spam` for any non-ticket message and `suspect`
when uncertain. Both non-allow verdicts are held rather than becoming tickets.

## Limits and validation

Endpoints require public HTTPS port 443, no credentials in URLs and no redirects.
Decision requests are limited to 24,000 UTF-8 bytes and responses to 64 KiB.
Custom verdict requests cap content at 100,000 characters and responses at 64 KiB.
The per-attempt timeout is 500–10,000 ms; fallback latency can accumulate across
route entries. Errors never create invented scores or silently admit a message.

These are interface and admission rules, not a promise of perfect model accuracy.
Evaluate labeled English/Chinese examples, promotions, meaningless text, genuine
complaints, quoted spam and contextual replies with your chosen model.
