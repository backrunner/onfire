CREATE TABLE `user_products` (
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `product_id`)
);
--> statement-breakpoint
CREATE INDEX `user_products_product_idx` ON `user_products` (`product_id`);--> statement-breakpoint
-- Preserve existing ProductAdmin scope that was previously inferred through
-- support-agent team membership. Future assignments use user_products only.
INSERT OR IGNORE INTO `user_products` (`user_id`, `product_id`)
SELECT DISTINCT `users`.`id`, `product_teams`.`product_id`
FROM `users`
INNER JOIN `agent_teams` ON `agent_teams`.`user_id` = `users`.`id`
INNER JOIN `product_teams` ON `product_teams`.`team_id` = `agent_teams`.`team_id`
WHERE `users`.`role` = 'product_admin';
