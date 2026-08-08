PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_communications` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`sender_id` text,
	`channel` text NOT NULL,
	`direction` text NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_communications`("id", "client_id", "sender_id", "channel", "direction", "subject", "body", "created_at") SELECT "id", "client_id", "sender_id", "channel", "direction", "subject", "body", "created_at" FROM `communications`;--> statement-breakpoint
DROP TABLE `communications`;--> statement-breakpoint
ALTER TABLE `__new_communications` RENAME TO `communications`;--> statement-breakpoint
PRAGMA foreign_keys=ON;