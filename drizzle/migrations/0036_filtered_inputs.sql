CREATE TABLE `filtered_inputs` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`ticket_id` text,
	`subject` text NOT NULL,
	`content` text NOT NULL,
	`content_html` text,
	`ticket_type_id` text,
	`template_version_id` text,
	`metadata` text,
	`priority` text,
	`language` text NOT NULL,
	`filter_provider` text NOT NULL,
	`filter_verdict` text NOT NULL,
	`filter_score` real,
	`filter_reason` text NOT NULL,
	`filter_result` text,
	`restored_ticket_id` text,
	`restored_reply_id` text,
	`released_at` text,
	`released_by` text,
	`release_reason` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `filtered_inputs_product_created_idx` ON `filtered_inputs` (`product_id`,`created_at`);