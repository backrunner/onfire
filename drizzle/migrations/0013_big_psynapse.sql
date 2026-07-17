CREATE TABLE `spam_filter_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_key` text NOT NULL,
	`scope` text NOT NULL,
	`tenant_id` text,
	`mode` text DEFAULT 'inherit' NOT NULL,
	`endpoint_url` text,
	`auth_secret` text,
	`timeout_ms` integer DEFAULT 3000 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spam_filter_configs_scope_key_unique` ON `spam_filter_configs` (`scope_key`);--> statement-breakpoint
CREATE TABLE `ticket_template_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`version` integer NOT NULL,
	`form_schema` text NOT NULL,
	`change_note` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`invalidated_at` text,
	`invalidated_by` text,
	`invalidation_reason` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ticket_template_versions_template_version_uq` ON `ticket_template_versions` (`template_id`,`version`);--> statement-breakpoint
CREATE INDEX `ticket_template_versions_template_idx` ON `ticket_template_versions` (`template_id`);--> statement-breakpoint
CREATE TABLE `ticket_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_type_id` text NOT NULL,
	`current_version_id` text,
	`archived_at` text,
	`archived_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ticket_templates_ticket_type_id_unique` ON `ticket_templates` (`ticket_type_id`);--> statement-breakpoint
CREATE TABLE `ticket_type_routes` (
	`ticket_type_id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ticket_types` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`parent_id` text,
	`level` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`system_key` text,
	`archived_at` text,
	`archived_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ticket_types_product_parent_idx` ON `ticket_types` (`product_id`,`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ticket_types_product_system_uq` ON `ticket_types` (`product_id`,`system_key`);--> statement-breakpoint
INSERT INTO `ticket_types` (
	`id`, `product_id`, `parent_id`, `level`, `name`, `description`, `sort_order`,
	`system_key`, `created_at`, `updated_at`
)
SELECT
	'system-unclassified:' || `id`, `id`, NULL, 1, 'Unclassified',
	'System fallback for inbound messages that cannot be classified', -2147483648,
	'unclassified', datetime('now'), datetime('now')
FROM `products`;--> statement-breakpoint
INSERT INTO `ticket_types` (
	`id`, `product_id`, `parent_id`, `level`, `name`, `description`, `sort_order`,
	`system_key`, `archived_at`, `created_at`, `updated_at`
)
SELECT
	'legacy-type:' || `id`, `product_id`, NULL, 1, `title`,
	'Migrated from the legacy ticket template model', 0,
	'legacy:' || `id`, datetime('now'), datetime('now'), datetime('now')
FROM `templates`;--> statement-breakpoint
INSERT INTO `ticket_templates` (
	`id`, `ticket_type_id`, `current_version_id`, `archived_at`, `created_at`, `updated_at`
)
SELECT
	'legacy-template:' || `id`, 'legacy-type:' || `id`, 'legacy-version:' || `id`,
	datetime('now'), datetime('now'), datetime('now')
FROM `templates`;--> statement-breakpoint
INSERT INTO `ticket_template_versions` (
	`id`, `template_id`, `version`, `form_schema`, `change_note`, `created_at`
)
SELECT
	'legacy-version:' || `id`, 'legacy-template:' || `id`, 1, `form_schema`,
	'Migrated legacy template', datetime('now')
FROM `templates`;--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD `auto_submitted` text;--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD `precedence` text;--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD `list_id` text;--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD `return_path` text;--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD `filter_stage` text;--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD `filter_provider` text;--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD `filter_verdict` text;--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD `filter_score` real;--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD `filter_reason` text;--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD `candidate_ticket_id` text;--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD `released_at` text;--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD `released_by` text;--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD `release_reason` text;--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD `release_ticket_type_id` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `ticket_type_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `template_version_id` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `ticket_type_path` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE `tickets`
SET
	`ticket_type_id` = COALESCE(
		(SELECT 'legacy-type:' || `templates`.`id` FROM `templates` WHERE `templates`.`id` = `tickets`.`template_id`),
		'system-unclassified:' || `tickets`.`product_id`
	),
	`template_version_id` = (
		SELECT 'legacy-version:' || `templates`.`id` FROM `templates` WHERE `templates`.`id` = `tickets`.`template_id`
	),
	`ticket_type_path` = json_array(json_object(
		'id', COALESCE(
			(SELECT 'legacy-type:' || `templates`.`id` FROM `templates` WHERE `templates`.`id` = `tickets`.`template_id`),
			'system-unclassified:' || `tickets`.`product_id`
		),
		'name', COALESCE(
			CASE
				WHEN json_valid(`tickets`.`metadata`)
				THEN json_extract(`tickets`.`metadata`, '$.category')
				ELSE NULL
			END,
			(SELECT `templates`.`title` FROM `templates` WHERE `templates`.`id` = `tickets`.`template_id`),
			'Unclassified'
		)
	));--> statement-breakpoint
CREATE INDEX `tickets_type_idx` ON `tickets` (`ticket_type_id`);--> statement-breakpoint
CREATE INDEX `tickets_template_version_idx` ON `tickets` (`template_version_id`);
