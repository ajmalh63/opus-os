CREATE TABLE `membership_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`price_paise` integer NOT NULL,
	`duration_days` integer NOT NULL,
	`tier` text DEFAULT 'basic' NOT NULL,
	`perks_json` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_plans_key_unique` ON `membership_plans` (`key`);--> statement-breakpoint
ALTER TABLE `clients` ADD `exclusive_member` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `exclusive_expires_at` integer;--> statement-breakpoint
ALTER TABLE `clients` ADD `exclusive_plan` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `exclusive_since` integer;--> statement-breakpoint
ALTER TABLE `clients` ADD `instagram_handle` text;