CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`cal_uid` text NOT NULL,
	`event_type_id` text NOT NULL,
	`division` text NOT NULL,
	`title` text NOT NULL,
	`start_time` integer NOT NULL,
	`end_time` integer NOT NULL,
	`attendee_name` text,
	`attendee_email` text,
	`attendee_phone` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`client_id` text,
	`task_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_cal_uid_unique` ON `bookings` (`cal_uid`);