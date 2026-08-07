CREATE TABLE `group_departures` (
	`id` text PRIMARY KEY NOT NULL,
	`package_tier` text DEFAULT 'standard' NOT NULL,
	`departure_date` integer NOT NULL,
	`capacity` integer DEFAULT 30 NOT NULL,
	`booked_seats` integer DEFAULT 0 NOT NULL,
	`price` integer NOT NULL,
	`booking_fee` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `seat_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`departure_id` text NOT NULL,
	`client_id` text NOT NULL,
	`status` text DEFAULT 'held' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`departure_id`) REFERENCES `group_departures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
