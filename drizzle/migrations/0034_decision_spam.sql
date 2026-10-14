ALTER TABLE `ai_task_credentials` ADD `spam_label` text;--> statement-breakpoint
ALTER TABLE `spam_filter_configs` ADD `spam_threshold` real DEFAULT 0.9 NOT NULL;--> statement-breakpoint
ALTER TABLE `spam_filter_configs` ADD `suspect_threshold` real DEFAULT 0.5 NOT NULL;