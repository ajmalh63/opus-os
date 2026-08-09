CREATE TABLE `commission_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text,
	`catalog_type` text DEFAULT '*' NOT NULL,
	`catalog_item_id` text,
	`rate_pct` integer NOT NULL,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON UPDATE no action ON DELETE no action
);
