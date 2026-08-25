ALTER TABLE `products` ADD `default_language` text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `supported_languages` text;--> statement-breakpoint
ALTER TABLE `replies` ADD `detected_language` text;--> statement-breakpoint
ALTER TABLE `replies` ADD `translations` text;--> statement-breakpoint
ALTER TABLE `ticket_type_presets` ADD `name_i18n` text;--> statement-breakpoint
ALTER TABLE `ticket_type_presets` ADD `description_i18n` text;--> statement-breakpoint
ALTER TABLE `ticket_types` ADD `name_i18n` text;--> statement-breakpoint
ALTER TABLE `ticket_types` ADD `description_i18n` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `customer_language` text;
