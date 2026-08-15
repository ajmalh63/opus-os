ALTER TABLE `seat_bookings` ADD `occupancy` text DEFAULT 'shared' NOT NULL;--> statement-breakpoint
ALTER TABLE `umrah_packages` ADD `solo_available` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `umrah_packages` ADD `solo_supplement_paise` integer DEFAULT 0 NOT NULL;