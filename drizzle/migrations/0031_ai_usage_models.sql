ALTER TABLE `ai_usage_daily` ADD `provider` text;--> statement-breakpoint
ALTER TABLE `ai_usage_daily` ADD `model` text;
--> statement-breakpoint
-- Recover model attribution only from detail events still retained. Join existing
-- rollups so independently expired system/tenant/product buckets stay expired.
CREATE TABLE `_ai_usage_model_backfill` AS
SELECT d.id AS original_id,
  d.bucket_key || '|' || json_array(e.provider, e.model) AS bucket_key,
  d.day, d.dimension, d.tenant_id, d.product_id, d.credential_id, d.task_type,
  e.provider, e.model,
  sum(e.prompt_tokens) AS prompt_tokens,
  sum(e.completion_tokens) AS completion_tokens,
  sum(e.total_tokens) AS total_tokens,
  count(*) AS request_count, d.updated_at
FROM ai_usage_daily d
JOIN ai_usage_events e ON e.credential_id = d.credential_id
  AND e.task_type = d.task_type
  AND e.created_at >= d.day || 'T00:00:00.000Z'
  AND e.created_at < date(d.day, '+1 day') || 'T00:00:00.000Z'
  AND (d.dimension = 'system'
    OR (d.dimension = 'tenant' AND e.tenant_id = d.tenant_id)
    OR (d.dimension = 'product' AND e.product_id = d.product_id))
GROUP BY d.id, e.provider, e.model;
--> statement-breakpoint
CREATE INDEX `_ai_usage_model_backfill_original_idx` ON `_ai_usage_model_backfill` (original_id);
--> statement-breakpoint
-- Keep any unidentifiable remainder as a legacy bucket, without guessing the
-- model/provider from a credential's current configuration or changing totals.
UPDATE ai_usage_daily AS d SET
  prompt_tokens = prompt_tokens - (SELECT sum(b.prompt_tokens) FROM _ai_usage_model_backfill b WHERE b.original_id = d.id),
  completion_tokens = completion_tokens - (SELECT sum(b.completion_tokens) FROM _ai_usage_model_backfill b WHERE b.original_id = d.id),
  total_tokens = total_tokens - (SELECT sum(b.total_tokens) FROM _ai_usage_model_backfill b WHERE b.original_id = d.id),
  request_count = request_count - (SELECT sum(b.request_count) FROM _ai_usage_model_backfill b WHERE b.original_id = d.id)
WHERE id IN (SELECT original_id FROM _ai_usage_model_backfill);
--> statement-breakpoint
DELETE FROM ai_usage_daily WHERE request_count = 0
  AND prompt_tokens = 0 AND completion_tokens = 0 AND total_tokens = 0;
--> statement-breakpoint
INSERT INTO ai_usage_daily (
  id, bucket_key, day, dimension, tenant_id, product_id, credential_id, task_type,
  provider, model, prompt_tokens, completion_tokens, total_tokens, request_count, updated_at
)
SELECT lower(hex(randomblob(16))), bucket_key, day, dimension, tenant_id, product_id,
  credential_id, task_type, provider, model, prompt_tokens, completion_tokens,
  total_tokens, request_count, updated_at
FROM _ai_usage_model_backfill;
--> statement-breakpoint
DROP TABLE `_ai_usage_model_backfill`;
