CREATE TABLE `partner_links` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`catalog_type` text NOT NULL,
	`catalog_item_id` text NOT NULL,
	`title` text NOT NULL,
	`price_paise` integer DEFAULT 0 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`last_clicked_at` integer,
	FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `partner_points` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`points` integer NOT NULL,
	`reason` text NOT NULL,
	`reference_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `partner_tiers` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`min_points` integer DEFAULT 0 NOT NULL,
	`commission_boost_pct` integer DEFAULT 0 NOT NULL,
	`perks_json` text DEFAULT '[]' NOT NULL,
	`color` text DEFAULT 'brand-gold' NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `partner_tiers_key_unique` ON `partner_tiers` (`key`);