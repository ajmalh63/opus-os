CREATE TABLE `board_prefs` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `payments` ADD `razorpay_link_id` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `razorpay_short_url` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `link_status` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `razorpay_payment_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `cos` text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `blocked_reason` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `in_progress_at` integer;