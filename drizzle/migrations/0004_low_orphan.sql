ALTER TABLE `inbound_emails` ADD `in_reply_to` text;--> statement-breakpoint
ALTER TABLE `inbound_emails` ADD `references_header` text;--> statement-breakpoint
CREATE UNIQUE INDEX `email_configs_inbound_address_uq` ON `email_configs` (`inbound_address`);