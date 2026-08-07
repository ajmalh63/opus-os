CREATE TABLE `experiment_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`experiment_key` text NOT NULL,
	`client_id` text NOT NULL,
	`variant` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`experiment_key`) REFERENCES `experiments`(`key`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`hypothesis` text NOT NULL,
	`primary_metric` text NOT NULL,
	`baseline_rate` real NOT NULL,
	`mde` real NOT NULL,
	`variant_a` text NOT NULL,
	`variant_b` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`started_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `experiments_key_unique` ON `experiments` (`key`);--> statement-breakpoint
CREATE TABLE `nurture_touches` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`engagement_id` text,
	`channel` text DEFAULT 'whatsapp' NOT NULL,
	`stage` text NOT NULL,
	`body` text NOT NULL,
	`due_at` integer NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action
);
