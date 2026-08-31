PRAGMA foreign_keys = OFF;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ocr_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`model_version` text DEFAULT 'mrz-v1-icao9303' NOT NULL,
	`signals_json` text NOT NULL,
	`extracted_json` text NOT NULL,
	`raw_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ocr_runs_document_idx` ON `ocr_runs` (`document_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ocr_runs_actor_idx` ON `ocr_runs` (`actor_id`);--> statement-breakpoint
ALTER TABLE `documents` ADD `ocr_json` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `ocr_signals` text;