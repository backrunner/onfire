CREATE TABLE `account_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`secret_hash` text NOT NULL,
	`permissions` text NOT NULL,
	`resource_mode` text NOT NULL,
	`product_ids` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_api_keys_user_idx` ON `account_api_keys` (`user_id`);--> statement-breakpoint
ALTER TABLE `product_keys` ADD `expires_at` text;