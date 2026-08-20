CREATE TABLE `partner_creatives` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`type` text DEFAULT 'text' NOT NULL,
	`size` text,
	`url` text NOT NULL,
	`image_key` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `partners` ADD `payout_method` text;--> statement-breakpoint
ALTER TABLE `partners` ADD `payout_detail` text;--> statement-breakpoint
ALTER TABLE `partners` ADD `payout_threshold_paise` integer DEFAULT 0 NOT NULL;