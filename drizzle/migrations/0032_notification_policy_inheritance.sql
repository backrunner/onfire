PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_notification_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text DEFAULT 'product' NOT NULL,
	`tenant_id` text,
	`team_id` text,
	`product_id` text,
	`overrides_id` text,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true,
	`scope_type` text NOT NULL,
	`scope_team_id` text,
	`scope_user_id` text,
	`trigger_events` text NOT NULL,
	`channel_types` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_notification_requirements`("id", "scope", "tenant_id", "team_id", "product_id", "overrides_id", "name", "enabled", "scope_type", "scope_team_id", "scope_user_id", "trigger_events", "channel_types", "created_at", "updated_at") SELECT "id", 'product', NULL, NULL, "product_id", NULL, "name", "enabled", "scope_type", "scope_team_id", "scope_user_id", "trigger_events", "channel_types", "created_at", "updated_at" FROM `notification_requirements`;--> statement-breakpoint
DROP TABLE `notification_requirements`;--> statement-breakpoint
ALTER TABLE `__new_notification_requirements` RENAME TO `notification_requirements`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `notification_requirements_product_idx` ON `notification_requirements` (`product_id`);--> statement-breakpoint
CREATE INDEX `notification_requirements_tenant_idx` ON `notification_requirements` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `notification_requirements_team_idx` ON `notification_requirements` (`team_id`);--> statement-breakpoint
CREATE INDEX `notification_requirements_overrides_idx` ON `notification_requirements` (`overrides_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_requirements_product_override_uq` ON `notification_requirements` (`product_id`,`overrides_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_requirements_team_override_uq` ON `notification_requirements` (`team_id`,`overrides_id`);--> statement-breakpoint
CREATE TABLE `__new_notification_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text DEFAULT 'product' NOT NULL,
	`tenant_id` text,
	`team_id` text,
	`product_id` text,
	`overrides_id` text,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true,
	`trigger_events` text NOT NULL,
	`channel_types` text NOT NULL,
	`recipient_type` text NOT NULL,
	`recipient_team_id` text,
	`recipient_user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_notification_rules`("id", "scope", "tenant_id", "team_id", "product_id", "overrides_id", "name", "enabled", "trigger_events", "channel_types", "recipient_type", "recipient_team_id", "recipient_user_id", "created_at", "updated_at") SELECT "id", 'product', NULL, NULL, "product_id", NULL, "name", "enabled", "trigger_events", "channel_types", "recipient_type", "recipient_team_id", "recipient_user_id", "created_at", "updated_at" FROM `notification_rules`;--> statement-breakpoint
DROP TABLE `notification_rules`;--> statement-breakpoint
ALTER TABLE `__new_notification_rules` RENAME TO `notification_rules`;--> statement-breakpoint
CREATE INDEX `notification_rules_product_idx` ON `notification_rules` (`product_id`);--> statement-breakpoint
CREATE INDEX `notification_rules_tenant_idx` ON `notification_rules` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `notification_rules_team_idx` ON `notification_rules` (`team_id`);--> statement-breakpoint
CREATE INDEX `notification_rules_overrides_idx` ON `notification_rules` (`overrides_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_rules_product_override_uq` ON `notification_rules` (`product_id`,`overrides_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_rules_team_override_uq` ON `notification_rules` (`team_id`,`overrides_id`);