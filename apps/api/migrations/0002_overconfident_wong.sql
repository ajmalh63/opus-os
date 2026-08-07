CREATE TABLE `agreement_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`division` text NOT NULL,
	`clauses_json` text NOT NULL,
	`version` text DEFAULT 'v1.0' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agreements` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`template_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`content` text NOT NULL,
	`esign_method` text,
	`ip_address` text,
	`user_agent` text,
	`sha256_hash` text,
	`signed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `agreement_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `clause_library` (
	`id` text PRIMARY KEY NOT NULL,
	`clause_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`division` text NOT NULL,
	`mandatory` integer DEFAULT false NOT NULL,
	`version` text DEFAULT 'v1.0' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clause_library_clause_id_unique` ON `clause_library` (`clause_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`engagement_id` text NOT NULL,
	`amount` integer NOT NULL,
	`type` text NOT NULL,
	`milestone_name` text NOT NULL,
	`method` text,
	`reference_number` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action
);
