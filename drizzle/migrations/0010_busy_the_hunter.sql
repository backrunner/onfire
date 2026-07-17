CREATE TABLE `ai_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`api_mode` text DEFAULT 'responses' NOT NULL,
	`api_key` text NOT NULL,
	`secret_purpose` text NOT NULL,
	`base_url` text,
	`enabled` integer DEFAULT true NOT NULL,
	`cooldown_seconds` integer DEFAULT 60 NOT NULL,
	`blocked_until` text,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`last_failure_at` text,
	`last_failure_message` text,
	`last_success_at` text,
	`last_used_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_credentials_provider_idx` ON `ai_credentials` (`provider`);--> statement-breakpoint
CREATE INDEX `ai_credentials_available_idx` ON `ai_credentials` (`enabled`,`blocked_until`);--> statement-breakpoint
CREATE TABLE `ai_task_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`task_type` text NOT NULL,
	`credential_id` text NOT NULL,
	`model` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_task_credentials_task_credential_unique` ON `ai_task_credentials` (`task_type`,`credential_id`);--> statement-breakpoint
CREATE INDEX `ai_task_credentials_task_priority_idx` ON `ai_task_credentials` (`task_type`,`priority`);--> statement-breakpoint
CREATE INDEX `ai_task_credentials_credential_idx` ON `ai_task_credentials` (`credential_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ai_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_type` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `ai_credentials` (
	`id`, `name`, `provider`, `api_mode`, `api_key`, `secret_purpose`,
	`base_url`, `enabled`, `cooldown_seconds`, `failure_count`,
	`created_at`, `updated_at`
)
SELECT
	`id`,
	upper(substr(`provider`, 1, 1)) || substr(`provider`, 2) || ' / ' || `task_type`,
	`provider`,
	`api_mode`,
	`api_key`,
	'ai-config:' || `task_type`,
	`base_url`,
	1,
	60,
	0,
	`created_at`,
	`updated_at`
FROM `ai_configs`;--> statement-breakpoint
INSERT INTO `ai_task_credentials` (
	`id`, `task_type`, `credential_id`, `model`, `priority`, `enabled`,
	`created_at`, `updated_at`
)
SELECT
	'route-' || `id`,
	`task_type`,
	`id`,
	`model`,
	0,
	1,
	`created_at`,
	`updated_at`
FROM `ai_configs`;--> statement-breakpoint
INSERT INTO `__new_ai_configs`("id", "task_type", "enabled", "created_at", "updated_at") SELECT "id", "task_type", COALESCE("enabled", 1), "created_at", "updated_at" FROM `ai_configs`;--> statement-breakpoint
DROP TABLE `ai_configs`;--> statement-breakpoint
ALTER TABLE `__new_ai_configs` RENAME TO `ai_configs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `ai_configs_task_type_unique` ON `ai_configs` (`task_type`);
