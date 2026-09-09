CREATE TABLE `email_dispatches` (
	`id` text PRIMARY KEY NOT NULL,
	`reply_to` text,
	`headers` text,
	`attempt_token` text,
	`attempt_started_at` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`queued_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_reply_intents` (
	`reply_id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`created_at` text NOT NULL
);
