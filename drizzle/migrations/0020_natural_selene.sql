CREATE TABLE `ai_usage_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`bucket_key` text NOT NULL,
	`day` text NOT NULL,
	`dimension` text NOT NULL,
	`tenant_id` text,
	`product_id` text,
	`credential_id` text NOT NULL,
	`task_type` text NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_usage_daily_bucket_key_unique` ON `ai_usage_daily` (`bucket_key`);--> statement-breakpoint
CREATE INDEX `ai_usage_daily_dimension_day_idx` ON `ai_usage_daily` (`dimension`,`day`);--> statement-breakpoint
CREATE INDEX `ai_usage_daily_tenant_day_idx` ON `ai_usage_daily` (`tenant_id`,`day`);--> statement-breakpoint
CREATE INDEX `ai_usage_daily_product_day_idx` ON `ai_usage_daily` (`product_id`,`day`);--> statement-breakpoint
CREATE TABLE `ai_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`credential_id` text NOT NULL,
	`task_type` text NOT NULL,
	`tenant_id` text,
	`product_id` text,
	`model` text NOT NULL,
	`provider` text NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`success` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_usage_events_created_idx` ON `ai_usage_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_events_tenant_created_idx` ON `ai_usage_events` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_events_product_created_idx` ON `ai_usage_events` (`product_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_events_credential_created_idx` ON `ai_usage_events` (`credential_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_usage_settings` (
	`scope_key` text PRIMARY KEY NOT NULL,
	`retention_days` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
DROP INDEX `ai_configs_task_type_unique`;--> statement-breakpoint
ALTER TABLE `ai_configs` ADD `scope_key` text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_configs` ADD `inherit` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `ai_configs_scope_task_unique` ON `ai_configs` (`scope_key`,`task_type`);--> statement-breakpoint
DROP INDEX `ai_task_credentials_task_credential_unique`;--> statement-breakpoint
DROP INDEX `ai_task_credentials_task_priority_idx`;--> statement-breakpoint
ALTER TABLE `ai_task_credentials` ADD `scope_key` text DEFAULT 'system' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `ai_task_credentials_scope_task_credential_unique` ON `ai_task_credentials` (`scope_key`,`task_type`,`credential_id`);--> statement-breakpoint
CREATE INDEX `ai_task_credentials_task_priority_idx` ON `ai_task_credentials` (`scope_key`,`task_type`,`priority`);--> statement-breakpoint
ALTER TABLE `ai_credentials` ADD `scope` text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_credentials` ADD `tenant_id` text;--> statement-breakpoint
ALTER TABLE `ai_credentials` ADD `product_id` text;--> statement-breakpoint
CREATE INDEX `ai_credentials_scope_idx` ON `ai_credentials` (`scope`,`tenant_id`,`product_id`);