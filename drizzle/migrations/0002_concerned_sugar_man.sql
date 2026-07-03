CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `tickets` ADD `sla_accept_warned` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `tickets` ADD `sla_reply_warned` integer DEFAULT false;