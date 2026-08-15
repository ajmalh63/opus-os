ALTER TABLE `documents` ADD `doc_label` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `scan_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `scan_note` text;