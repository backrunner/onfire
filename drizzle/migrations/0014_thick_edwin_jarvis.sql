CREATE TABLE `ticket_internal_state_values` (
	`ticket_id` text NOT NULL,
	`state_id` text NOT NULL,
	`value` text NOT NULL,
	`updated_by` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`ticket_id`, `state_id`)
);
--> statement-breakpoint
CREATE INDEX `ticket_internal_state_values_state_idx` ON `ticket_internal_state_values` (`state_id`);--> statement-breakpoint
CREATE TABLE `ticket_type_internal_states` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_type_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`kind` text NOT NULL,
	`options` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`archived_by` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ticket_type_internal_states_type_idx` ON `ticket_type_internal_states` (`ticket_type_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ticket_type_internal_states_name_uq` ON `ticket_type_internal_states` (`ticket_type_id`,`name`);--> statement-breakpoint
CREATE TABLE `ticket_type_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`parent_id` text,
	`level` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`archived_by` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ticket_type_presets_tenant_parent_idx` ON `ticket_type_presets` (`tenant_id`,`parent_id`);--> statement-breakpoint
