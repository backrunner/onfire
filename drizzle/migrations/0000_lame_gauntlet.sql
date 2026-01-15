CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agent_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`email` text NOT NULL,
	`avatar_url` text
);
--> statement-breakpoint
CREATE TABLE `agent_teams` (
	`user_id` text NOT NULL,
	`team_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`user_id` text PRIMARY KEY NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_calls` text,
	`tool_results` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_type` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`api_key` text NOT NULL,
	`base_url` text,
	`enabled` integer DEFAULT true,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_configs_task_type_unique` ON `ai_configs` (`task_type`);--> statement-breakpoint
CREATE TABLE `category_routes` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`category` text NOT NULL,
	`subcategory` text,
	`team_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`product_id` text NOT NULL,
	`email` text NOT NULL,
	`external_id` text,
	`level` integer,
	`meta` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`inbound_enabled` integer DEFAULT false,
	`inbound_provider` text,
	`inbound_address` text,
	`inbound_webhook_secret` text,
	`outbound_enabled` integer DEFAULT false,
	`outbound_provider` text,
	`outbound_api_key` text,
	`outbound_smtp_host` text,
	`outbound_smtp_port` integer,
	`outbound_smtp_user` text,
	`outbound_smtp_pass` text,
	`outbound_sender_name` text,
	`outbound_sender_email` text,
	`outbound_reply_to` text,
	`ai_filter_enabled` integer DEFAULT true,
	`ai_filter_strictness` text DEFAULT 'medium',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_configs_product_id_unique` ON `email_configs` (`product_id`);--> statement-breakpoint
CREATE TABLE `email_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`template_type` text NOT NULL,
	`subject_template` text NOT NULL,
	`body_template` text NOT NULL,
	`enabled` integer DEFAULT true,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `history` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`snapshot` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inbound_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`message_id` text NOT NULL,
	`provider` text NOT NULL,
	`from_email` text NOT NULL,
	`from_name` text,
	`to_email` text NOT NULL,
	`subject` text,
	`body_plain` text,
	`body_html` text,
	`processing_status` text DEFAULT 'pending' NOT NULL,
	`filter_result` text,
	`ticket_id` text,
	`reply_id` text,
	`error_message` text,
	`spf_result` text,
	`dkim_result` integer,
	`is_spam` integer,
	`raw_payload` text,
	`created_at` text NOT NULL,
	`processed_at` text
);
--> statement-breakpoint
CREATE TABLE `notification_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`channel_type` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true,
	`config` text NOT NULL,
	`trigger_events` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`channel_type` text NOT NULL,
	`ticket_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`trigger_event` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`created_at` text NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
CREATE TABLE `outbound_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`ticket_id` text,
	`reply_id` text,
	`to_email` text NOT NULL,
	`to_name` text,
	`from_email` text NOT NULL,
	`from_name` text,
	`subject` text NOT NULL,
	`body_html` text NOT NULL,
	`body_plain` text,
	`provider` text NOT NULL,
	`provider_message_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`created_at` text NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
CREATE TABLE `product_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`filename` text NOT NULL,
	`r2_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`status` text DEFAULT 'pending',
	`error_message` text,
	`vectorize_ids` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`name` text,
	`secret` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`revoked` integer DEFAULT false
);
--> statement-breakpoint
CREATE TABLE `product_knowledge` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`knowledge_type` text NOT NULL,
	`vectorize_ids` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_teams` (
	`product_id` text NOT NULL,
	`team_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`sla_high_accept` integer,
	`sla_high_reply` integer,
	`sla_medium_accept` integer,
	`sla_medium_reply` integer,
	`sla_low_accept` integer,
	`sla_low_reply` integer
);
--> statement-breakpoint
CREATE TABLE `replies` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`sender_id` text,
	`sender_email` text,
	`content` text NOT NULL,
	`internal` integer DEFAULT false,
	`source` text DEFAULT 'web',
	`source_email_id` text,
	`email_sent` integer DEFAULT false,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`allow_reassign` integer DEFAULT true
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`title` text NOT NULL,
	`categories` text NOT NULL,
	`form_schema` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`default_team_id` text
);
--> statement-breakpoint
CREATE TABLE `ticket_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`tag` text NOT NULL,
	`source` text NOT NULL,
	`confidence` real,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`product_id` text NOT NULL,
	`team_id` text NOT NULL,
	`assignee_id` text,
	`status` text NOT NULL,
	`priority` text NOT NULL,
	`subject` text NOT NULL,
	`content` text NOT NULL,
	`customer_email` text NOT NULL,
	`customer_level` integer,
	`template_id` text,
	`metadata` text,
	`sla_accept_deadline` text,
	`sla_reply_deadline` text,
	`sla_accept_breached` integer DEFAULT false,
	`sla_reply_breached` integer DEFAULT false,
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
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`tenant_id` text NOT NULL,
	`role` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
