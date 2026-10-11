CREATE TABLE `ticket_number_sequence` (
	`id` integer PRIMARY KEY NOT NULL,
	`value` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `tickets` ADD `number` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_number_idx` ON `tickets` (`number`) WHERE "tickets"."number" > 0;
--> statement-breakpoint
-- Preserve UUID references and assign existing tickets deterministic chronological numbers.
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS ticket_number FROM tickets
)
UPDATE tickets SET number = (SELECT ticket_number FROM numbered WHERE numbered.id = tickets.id);
--> statement-breakpoint
INSERT INTO ticket_number_sequence (id, value) SELECT 1, coalesce(max(number), 0) FROM tickets;
--> statement-breakpoint
-- Keep trigger definitions on one line for the remote D1 statement parser.
CREATE TRIGGER tickets_number_insert_guard BEFORE INSERT ON tickets WHEN NEW.number != 0 BEGIN SELECT RAISE(ABORT, 'Ticket numbers are allocated by the database'); END;
--> statement-breakpoint
CREATE TRIGGER tickets_number_allocate AFTER INSERT ON tickets BEGIN UPDATE ticket_number_sequence SET value = value + 1 WHERE id = 1 AND value < 9007199254740991; SELECT RAISE(ABORT, 'Ticket number allocation failed') WHERE changes() != 1; UPDATE tickets SET number = (SELECT value FROM ticket_number_sequence WHERE id = 1) WHERE id = NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER tickets_number_immutable BEFORE UPDATE OF number ON tickets WHEN NEW.number != OLD.number AND ( OLD.number != 0 OR NEW.number <= 0 OR NEW.number != (SELECT value FROM ticket_number_sequence WHERE id = 1) ) BEGIN SELECT RAISE(ABORT, 'Ticket numbers are immutable'); END;
