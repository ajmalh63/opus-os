CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`remote_id` text,
	`contact_key` text NOT NULL,
	`contact_name` text,
	`last_message` text,
	`last_message_at` integer,
	`unread` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL
);
