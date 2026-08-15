CREATE TABLE `staff_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`division` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`payload_json` text,
	`client_id` text,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer NOT NULL
);
