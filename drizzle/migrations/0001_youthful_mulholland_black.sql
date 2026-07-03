PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_teams` (
	`user_id` text NOT NULL,
	`team_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `team_id`)
);
--> statement-breakpoint
INSERT INTO `__new_agent_teams`("user_id", "team_id") SELECT "user_id", "team_id" FROM `agent_teams`;--> statement-breakpoint
DROP TABLE `agent_teams`;--> statement-breakpoint
ALTER TABLE `__new_agent_teams` RENAME TO `agent_teams`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `agent_teams_team_idx` ON `agent_teams` (`team_id`);--> statement-breakpoint
CREATE TABLE `__new_product_teams` (
	`product_id` text NOT NULL,
	`team_id` text NOT NULL,
	PRIMARY KEY(`product_id`, `team_id`)
);
--> statement-breakpoint
INSERT INTO `__new_product_teams`("product_id", "team_id") SELECT "product_id", "team_id" FROM `product_teams`;--> statement-breakpoint
DROP TABLE `product_teams`;--> statement-breakpoint
ALTER TABLE `__new_product_teams` RENAME TO `product_teams`;--> statement-breakpoint
ALTER TABLE `products` ADD `auto_close_minutes` integer;--> statement-breakpoint
CREATE INDEX `category_routes_product_category_idx` ON `category_routes` (`product_id`,`category`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_product_email_uq` ON `customers` (`product_id`,`email`);--> statement-breakpoint
CREATE INDEX `customers_tenant_idx` ON `customers` (`tenant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `email_templates_product_type_uq` ON `email_templates` (`product_id`,`template_type`);--> statement-breakpoint
CREATE INDEX `history_ticket_idx` ON `history` (`ticket_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inbound_emails_product_message_uq` ON `inbound_emails` (`product_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `inbound_emails_product_created_idx` ON `inbound_emails` (`product_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notification_channels_product_idx` ON `notification_channels` (`product_id`);--> statement-breakpoint
CREATE INDEX `notification_logs_product_created_idx` ON `notification_logs` (`product_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notification_logs_ticket_idx` ON `notification_logs` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `outbound_emails_product_created_idx` ON `outbound_emails` (`product_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `outbound_emails_ticket_idx` ON `outbound_emails` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `product_keys_product_idx` ON `product_keys` (`product_id`);--> statement-breakpoint
CREATE INDEX `replies_ticket_idx` ON `replies` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `templates_product_idx` ON `templates` (`product_id`);--> statement-breakpoint
CREATE INDEX `tickets_tenant_status_idx` ON `tickets` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `tickets_team_status_idx` ON `tickets` (`team_id`,`status`);--> statement-breakpoint
CREATE INDEX `tickets_product_status_idx` ON `tickets` (`product_id`,`status`);--> statement-breakpoint
CREATE INDEX `tickets_assignee_idx` ON `tickets` (`assignee_id`);--> statement-breakpoint
CREATE INDEX `tickets_customer_idx` ON `tickets` (`customer_email`,`product_id`);--> statement-breakpoint
CREATE INDEX `tickets_updated_idx` ON `tickets` (`updated_at`);--> statement-breakpoint
CREATE INDEX `users_tenant_idx` ON `users` (`tenant_id`);