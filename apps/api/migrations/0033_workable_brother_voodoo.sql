CREATE TABLE `umrah_checklists` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`passport_scanned` integer DEFAULT false NOT NULL,
	`visa_issued` integer DEFAULT false NOT NULL,
	`vaccine_certificate` integer DEFAULT false NOT NULL,
	`ticket_issued` integer DEFAULT false NOT NULL,
	`notes` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `seat_bookings`(`id`) ON UPDATE no action ON DELETE no action
);
