ALTER TABLE `umrah_packages` ADD COLUMN `category` text DEFAULT 'umrah_pilgrimage' NOT NULL;
--> statement-breakpoint
ALTER TABLE `umrah_packages` ADD COLUMN `destination_country` text;
--> statement-breakpoint
ALTER TABLE `umrah_packages` ADD COLUMN `destination_city` text;
--> statement-breakpoint
ALTER TABLE `umrah_packages` ADD COLUMN `hotel_name` text;
--> statement-breakpoint
ALTER TABLE `umrah_packages` ADD COLUMN `hotel_stars` integer;
--> statement-breakpoint
ALTER TABLE `umrah_packages` ADD COLUMN `sightseeing_highlights_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `umrah_packages_category_idx` ON `umrah_packages` (`category`);
