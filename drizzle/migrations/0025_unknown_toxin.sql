ALTER TABLE `ai_task_credentials` ADD `model_kind` text;--> statement-breakpoint
ALTER TABLE `ai_task_credentials` ADD `model_dimensions` integer;--> statement-breakpoint
UPDATE `ai_task_credentials`
SET
  `model_kind` = CASE
    WHEN `task_type` = 'embedding' THEN 'embedding'
    WHEN `task_type` = 'rerank' THEN 'rerank'
    ELSE 'text'
  END,
  `model_dimensions` = NULL;
--> statement-breakpoint
UPDATE `ai_task_credentials`
SET `model` = substr(`model`, 8)
WHERE `model` LIKE 'models/%'
  AND `credential_id` IN (
    SELECT `id` FROM `ai_credentials` WHERE `provider` = 'google'
  );
--> statement-breakpoint
UPDATE `ai_task_credentials`
SET `model` = substr(`model`, 9)
WHERE `model` LIKE 'jina-ai/%'
  AND `credential_id` IN (
    SELECT `id` FROM `ai_credentials` WHERE `provider` = 'jina'
  );
--> statement-breakpoint
UPDATE `ai_task_credentials`
SET `model_dimensions` = 1024
WHERE `task_type` = 'embedding'
  AND (
    (`credential_id` IN (SELECT `id` FROM `ai_credentials` WHERE `provider` = 'openai')
      AND `model` IN ('text-embedding-3-small', 'text-embedding-3-large'))
    OR (`credential_id` IN (SELECT `id` FROM `ai_credentials` WHERE `provider` = 'openrouter')
      AND `model` IN ('openai/text-embedding-3-small', 'openai/text-embedding-3-large'))
    OR (`credential_id` IN (SELECT `id` FROM `ai_credentials` WHERE `provider` = 'google')
      AND `model` IN ('gemini-embedding-001', 'gemini-embedding-2'))
    OR (`credential_id` IN (SELECT `id` FROM `ai_credentials` WHERE `provider` = 'qwen')
      AND `model` IN ('text-embedding-v3', 'text-embedding-v4'))
    OR (`credential_id` IN (SELECT `id` FROM `ai_credentials` WHERE `provider` = 'jina')
      AND `model` IN ('jina-embeddings-v3', 'jina-embeddings-v4', 'jina-embeddings-v5-text-small', 'jina-embeddings-v5-omni-small'))
    OR (`credential_id` IN (SELECT `id` FROM `ai_credentials` WHERE `provider` = 'cohere')
      AND `model` IN ('embed-v4.0', 'embed-multilingual-v3.0'))
  );
