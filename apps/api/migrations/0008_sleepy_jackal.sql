ALTER TABLE `agreements` ADD `esign_provider` text;--> statement-breakpoint
ALTER TABLE `agreements` ADD `esign_token` text;--> statement-breakpoint
ALTER TABLE `agreements` ADD `esign_status` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `agreements` ADD `esign_signed_doc_key` text;