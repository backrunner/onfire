ALTER TABLE `ai_task_credentials` ADD `model_kind` text;--> statement-breakpoint
ALTER TABLE `ai_task_credentials` ADD `model_dimensions` integer;--> statement-breakpoint
UPDATE `ai_task_credentials`
SET
  `model_kind` = CASE
    WHEN `task_type` = 'embedding' THEN 'embedding'
    WHEN `task_type` = 'rerank' THEN 'rerank'
    ELSE 'text'
  END,
  `model_dimensions` = CASE WHEN `task_type` = 'embedding' THEN 1024 ELSE NULL END;
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
