CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event` text NOT NULL,
	`entity_id` text,
	`signature` text,
	`received_at` integer NOT NULL,
	`processed` integer DEFAULT false NOT NULL,
	`detail` text
);
