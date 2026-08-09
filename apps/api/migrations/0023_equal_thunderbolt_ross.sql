ALTER TABLE `payments` ADD `status` text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `entered_by` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `confirmed_by` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `erp_doc_name` text;