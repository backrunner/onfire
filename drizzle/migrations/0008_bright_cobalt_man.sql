CREATE TABLE `product_identity_configs` (
	`product_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`endpoint_url` text,
	`auth_secret` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
