PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_customers` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`product_id` text NOT NULL,
	`email` text,
	`external_id` text,
	`level` integer,
	`meta` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_customers`("id", "tenant_id", "product_id", "email", "external_id", "level", "meta", "created_at", "updated_at") SELECT "id", "tenant_id", "product_id", "email", "external_id", "level", "meta", "created_at", "updated_at" FROM `customers`;--> statement-breakpoint
DROP TABLE `customers`;--> statement-breakpoint
ALTER TABLE `__new_customers` RENAME TO `customers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `customers_product_email_uq` ON `customers` (`product_id`,`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_product_external_uq` ON `customers` (`product_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `customers_tenant_idx` ON `customers` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `__new_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`product_id` text NOT NULL,
	`team_id` text NOT NULL,
	`assignee_id` text,
	`status` text NOT NULL,
	`priority` text NOT NULL,
	`subject` text NOT NULL,
	`content` text NOT NULL,
	`customer_id` text,
	`customer_email` text,
	`customer_level` integer,
	`template_id` text,
	`metadata` text,
	`sla_accept_deadline` text,
	`sla_reply_deadline` text,
	`sla_accept_breached` integer DEFAULT false,
	`sla_reply_breached` integer DEFAULT false,
	`sla_accept_warned` integer DEFAULT false,
	`sla_reply_warned` integer DEFAULT false,
	`ai_screening_status` text,
	`ai_screening_result` text,
	`ai_suggested_reply` text,
	`ai_extracted_issues` text,
	`ai_keywords` text,
	`vectorize_id` text,
	`source` text DEFAULT 'web',
	`source_email_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_tickets`("id", "tenant_id", "product_id", "team_id", "assignee_id", "status", "priority", "subject", "content", "customer_id", "customer_email", "customer_level", "template_id", "metadata", "sla_accept_deadline", "sla_reply_deadline", "sla_accept_breached", "sla_reply_breached", "sla_accept_warned", "sla_reply_warned", "ai_screening_status", "ai_screening_result", "ai_suggested_reply", "ai_extracted_issues", "ai_keywords", "vectorize_id", "source", "source_email_id", "created_at", "updated_at") SELECT "id", "tenant_id", "product_id", "team_id", "assignee_id", "status", "priority", "subject", "content", NULL, "customer_email", "customer_level", "template_id", "metadata", "sla_accept_deadline", "sla_reply_deadline", "sla_accept_breached", "sla_reply_breached", "sla_accept_warned", "sla_reply_warned", "ai_screening_status", "ai_screening_result", "ai_suggested_reply", "ai_extracted_issues", "ai_keywords", "vectorize_id", "source", "source_email_id", "created_at", "updated_at" FROM `tickets`;--> statement-breakpoint
DROP TABLE `tickets`;--> statement-breakpoint
ALTER TABLE `__new_tickets` RENAME TO `tickets`;--> statement-breakpoint
CREATE INDEX `tickets_tenant_status_idx` ON `tickets` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `tickets_team_status_idx` ON `tickets` (`team_id`,`status`);--> statement-breakpoint
CREATE INDEX `tickets_product_status_idx` ON `tickets` (`product_id`,`status`);--> statement-breakpoint
CREATE INDEX `tickets_assignee_idx` ON `tickets` (`assignee_id`);--> statement-breakpoint
CREATE INDEX `tickets_customer_idx` ON `tickets` (`customer_email`,`product_id`);--> statement-breakpoint
CREATE INDEX `tickets_customer_id_idx` ON `tickets` (`customer_id`);--> statement-breakpoint
CREATE INDEX `tickets_updated_idx` ON `tickets` (`updated_at`);