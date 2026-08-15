ALTER TABLE `visa_applications` ADD `form_json` text;--> statement-breakpoint
ALTER TABLE `visa_applications` ADD `submitted_at` integer;--> statement-breakpoint
ALTER TABLE `visa_applications` ADD `decision_at` integer;--> statement-breakpoint
ALTER TABLE `visa_applications` ADD `rejection_reason` text;--> statement-breakpoint
ALTER TABLE `visa_applications` ADD `delivered_at` integer;