CREATE TABLE `notification_endpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`channel_type` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true,
	`config` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notification_endpoints_user_idx` ON `notification_endpoints` (`user_id`);--> statement-breakpoint
CREATE INDEX `notification_endpoints_user_type_idx` ON `notification_endpoints` (`user_id`,`channel_type`);--> statement-breakpoint
CREATE TABLE `notification_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
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
CREATE INDEX `notification_requirements_product_idx` ON `notification_requirements` (`product_id`);--> statement-breakpoint
CREATE TABLE `notification_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
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
CREATE INDEX `notification_rules_product_idx` ON `notification_rules` (`product_id`);--> statement-breakpoint
DROP TABLE `notification_channels`;--> statement-breakpoint
CREATE TABLE `__new_notification_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`rule_id` text,
	`endpoint_id` text,
	`recipient_user_id` text NOT NULL,
	`channel_type` text NOT NULL,
	`ticket_id` text NOT NULL,
	`trigger_event` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`created_at` text NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
INSERT INTO `__new_notification_logs`(
	`id`,
	`product_id`,
	`rule_id`,
	`endpoint_id`,
	`recipient_user_id`,
	`channel_type`,
	`ticket_id`,
	`trigger_event`,
	`status`,
	`error_message`,
	`created_at`,
	`sent_at`
)
SELECT
	`id`,
	`product_id`,
	NULL,
	NULL,
	`agent_id`,
	`channel_type`,
	`ticket_id`,
	`trigger_event`,
	`status`,
	`error_message`,
	`created_at`,
	`sent_at`
FROM `notification_logs`;
--> statement-breakpoint
DROP TABLE `notification_logs`;
--> statement-breakpoint
ALTER TABLE `__new_notification_logs` RENAME TO `notification_logs`;
--> statement-breakpoint
CREATE INDEX `notification_logs_product_created_idx` ON `notification_logs` (`product_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `notification_logs_ticket_idx` ON `notification_logs` (`ticket_id`);
