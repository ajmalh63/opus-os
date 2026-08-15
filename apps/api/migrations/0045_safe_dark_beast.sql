ALTER TABLE `documents` ADD `size_bytes` integer;--> statement-breakpoint
ALTER TABLE `documents` ADD `mime_type` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `sha256` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `uploaded_by` text;