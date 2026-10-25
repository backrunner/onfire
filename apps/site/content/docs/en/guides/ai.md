---
title: AI and knowledge
description: Configure scoped providers, ordered task routes and structured knowledge.
order: 5
---

## Tasks and providers

| Task | Supported providers / purpose |
| --- | --- |
| `agent` | OpenAI, OpenRouter, Anthropic, Google, xAI, DeepSeek; dashboard assistant |
| `prescreening` | Those language providers or TypeSafe/Jev; classification, fixed tags and email type choice |
| `spam` | TypeSafe/Jev, contextual Hugging Face classification, Decision HTTP; genuine-support admission |
| `prereply` | Language providers; suggested agent replies |
| `translation` | Language providers; product text, ticket and public-reply translation |
| `embedding` | OpenAI, OpenRouter, Qwen, Jina, Cohere, Google |
| `rerank` | OpenRouter, Cohere, Jina |

Jev returns typed decisions, not summaries or new issue prose. A classifier or
Decision HTTP credential cannot generate replies, translations or embeddings.
OpenAI supports Responses (default) or Chat for compatible gateways; OpenRouter
uses Chat. Model IDs are verified against task capability and runtime output.
Custom endpoints require public HTTPS without query strings, fragments or redirects.

Model pickers search IDs and display names without changing the selected model.
Use arrow keys and Enter to choose, Escape to close, or refresh the provider list;
custom model IDs remain editable. OpenRouter discovery combines its text,
embedding and rerank catalogs. Embeddings with incompatible or unverified index
dimensions remain visible with an explanation and cannot be selected from the list.

## Scoped configuration

Create credentials separately from function routes. A route is an ordered list
of credential/model assignments; one credential can serve multiple compatible
functions. Product routes inherit tenant, then system settings unless overridden,
including explicit disable. System AI is SuperAdmin-only; tenant/product owners
manage their permitted scope. Parent credentials can be used in child routes,
without revealing saved keys. Secret fields remain encrypted at rest.

An enabled function needs an active assignment. Multi-language products need a
translation route. Email AI prescreening needs a prescreening route. Genuine-support
filtering is separately enabled in [spam settings](/docs/guides/spam-filter).
This gate runs before customer web/API/email writes; it is not the same as
post-creation ticket insights.

## Failover and usage

Runtime skips disabled/cooling credentials and tries the next eligible assignment
on provider or protocol failure. A failed key enters configurable cooldown only
when another candidate is available; the final candidate is not cooled down.
A successful response is never repeated just because bookkeeping failed.
Metadata edits/disable remain possible during provider outages; changing a key,
provider or endpoint can require route compatibility checks.

Each request records credential, provider, actual model where returned, success
and token usage at system, tenant and product dimensions. Retention is configurable
in days or permanent; cron removes expired detail/rollups. Classification providers
may report no tokens; zero reported tokens is not a free-of-charge claim.

## Knowledge and coordinate spaces

Structured product knowledge is indexed in product/model-specific namespaces.
The embedding dimension comes from the bound Vectorize index (example configuration
uses 1024; runtime supports up to 1536). Vectors must have exactly that many finite
values; OnFire never pads or truncates an incompatible result.

Embedding fallback keys must use the same provider, endpoint, model and dimensions.
Changing the effective embedding space queues a durable, leased rebuild, including
inherited changes. The knowledge tab shows progress and can request rebuilding.
Pending entries remain queryable through scoped D1 fallback; reranking is bounded
and preserves retrieval order when unavailable.

## Source document limit

Uploads accept PDF, text, Markdown, DOC and DOCX up to 10 MB. A document marked
`ready` means its original file is safely stored in R2. Automatic document text
extraction and indexing are **not implemented**. Use structured knowledge entries
for retrieval; do not assume a successful upload made a file searchable by AI.
