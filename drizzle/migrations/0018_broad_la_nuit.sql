CREATE TABLE `mcp_oauth_authorizations` (
	`authorization_code_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`grant_version` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mcp_oauth_authorizations_user_client_idx` ON `mcp_oauth_authorizations` (`user_id`,`client_id`);--> statement-breakpoint
ALTER TABLE `mcp_oauth_grants` ADD `version` text DEFAULT 'legacy' NOT NULL;