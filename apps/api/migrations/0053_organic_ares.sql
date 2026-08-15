CREATE TABLE `booking_passengers` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`name` text NOT NULL,
	`dob` text,
	`passport_number` text,
	`category` text DEFAULT 'adult' NOT NULL,
	`special_needs` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `seat_bookings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `seat_bookings` ADD `pax_count` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `seat_bookings` ADD `room_config` text;--> statement-breakpoint
ALTER TABLE `umrah_packages` ADD `child_with_bed_price_paise` integer;--> statement-breakpoint
ALTER TABLE `umrah_packages` ADD `child_no_bed_price_paise` integer;--> statement-breakpoint
ALTER TABLE `umrah_packages` ADD `infant_price_paise` integer;