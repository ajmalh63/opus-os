CREATE TABLE `listmonk_suppressions` (
	`email` text PRIMARY KEY NOT NULL,
	`suppressed` integer DEFAULT false NOT NULL,
	`reason` text,
	`soft_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event` text NOT NULL,
	`entity_id` text,
	`signature` text,
	`received_at` integer NOT NULL,
	`processed` integer DEFAULT false NOT NULL,
	`detail` text
);
--> statement-breakpoint
ALTER TABLE `campaign_touches` ADD `channel` text DEFAULT 'whatsapp' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `intent_divisions` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `primary_division` text;