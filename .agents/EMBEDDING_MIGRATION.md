# Embedding models, dimensions, and rebuilding

## Index contract

OnFire discovers dimensions from the `VECTORIZE` binding's `describe()` response
(current and beta response shapes are supported). It requests that output size
from the embedding provider and validates every returned number before upload.
The production `onfire-knowledge` index currently has 1024 dimensions. This is an
index property, not a universal model requirement. A Vectorize index cannot mix
vector lengths or change its configured dimension; namespaces do not change it.
Cloudflare currently permits up to 1536 dimensions per vector.

Route saves resolve catalog capabilities against the bound index dimension.
Custom/unlisted embedding models request that dimension and fail validation if
the provider cannot produce it. Models with larger native output may be used
only if their API supports the requested output size. OnFire never pads or
truncates vectors locally. A provider's catalog is not an automatic dimension
conversion service.

References:
- https://developers.cloudflare.com/vectorize/reference/client-api/
- https://developers.cloudflare.com/vectorize/platform/limits/

## Changing a model at the same dimension

Save the embedding route normally. Product routes may override or inherit
system/tenant routes. The effective provider, endpoint, model and dimensions
identify a coordinate space; changing any of these creates a different space.
API key rotation for the same provider/endpoint/model does not require a rebuild.
Embedding fallback credentials must share this identity. Existing mixed-model
routes use only credentials compatible with their first enabled entry, even if
that entry is cooling down; they never query another model's vectors.

The scheduled scan detects entries whose stored model or source version differs
from their effective route. It processes at most five entries per scan (the
existing cron runs every five minutes), with durable D1 leases and retry delay.
Failed entries retain error state and can retry; concurrent edits/deletion or a
route change cannot publish an obsolete vector as the current source version.
The knowledge tab displays indexed/pending/failed counts. “Rebuild index” resets
all entries in the selected product for retry. The API is:

- `GET /api/tob/admin/ai/knowledge/reindex?productId=...` — current profile/counts
- `POST /api/tob/admin/ai/knowledge/reindex` with `{ "productId": "..." } — queue rebuild

Both require `ai.knowledge` and live product scope. Changing a route needs no
manual queue action. Index replacement at the same dimension does require the
explicit rebuild action because a binding does not expose a stable index ID.
Model aliases silently repointed by a provider likewise require manual rebuild.

Queries use a hashed product+model namespace and verify current D1 vector IDs
and source versions. Unmigrated or stale rows remain available through the
scoped D1/rerank fallback; semantic quality improves as rebuilding completes.
No cutover waits for the entire corpus. Vectorize mutations are asynchronous;
accepted uploads may take a few seconds to become queryable. Old vectors are
deleted after successful replacement; failed cleanup can leave unreachable
vectors, but they cannot become current query results.

## Changing dimensions

This requires an operator-managed replacement index; the application has no
Cloudflare management token and never creates indexes itself.

1. Back up deployment configuration and keep the old index for rollback.
2. Create a new cosine Vectorize index with the desired dimension (<=1536) and
   point the Worker's `VECTORIZE` binding at it in the release configuration.
3. Apply migration `0027_knowledge_embedding_rebuild.sql` before releasing this
   code. Changing bindings/indexes and remote migrations require operator
   authorization; local tests do not authorize these remote operations.
4. Save compatible embedding routes after the new binding is active so their
   server-verified dimensions match it. Until then semantic calls fail safely
   and knowledge retrieval uses D1/rerank fallback.
5. Use “Rebuild index” for every affected product and monitor pending/failed
   counts. Rebuilding re-embeds original D1 text; old vectors are not convertible
   into another model's coordinate space.
6. Verify retrieval quality before retiring the old index. To roll back, restore
   the old binding and route, then queue rebuilding again (D1 may now point at
   vectors from the replacement index).

The initial migration deliberately leaves legacy embedding identity unknown,
which queues all existing knowledge for rebuilding instead of assuming it used
the current model. Rebuilds make billable embedding calls. Uploaded PDF/DOC/DOCX
files still have no text-extraction pipeline; this migration covers structured
knowledge entries only.
