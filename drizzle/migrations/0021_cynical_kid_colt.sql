PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text,
	`product_id` text,
	`scope` text DEFAULT 'tenant' NOT NULL,
	`name` text NOT NULL,
	`allow_reassign` integer DEFAULT true
);
--> statement-breakpoint
INSERT INTO `__new_teams`("id", "tenant_id", "product_id", "scope", "name", "allow_reassign") SELECT "id", "tenant_id", NULL, 'tenant', "name", "allow_reassign" FROM `teams`;--> statement-breakpoint
DROP TABLE `teams`;--> statement-breakpoint
ALTER TABLE `__new_teams` RENAME TO `teams`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `teams_scope_idx` ON `teams` (`scope`,`tenant_id`,`product_id`);