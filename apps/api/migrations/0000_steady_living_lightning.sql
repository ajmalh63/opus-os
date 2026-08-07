CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_name` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_state` text,
	`after_state` text,
	`ip_address` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text NOT NULL,
	`dob` text,
	`city` text,
	`highest_qualification` text,
	`passport_number` text,
	`passport_expiry` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `communications` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
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
CREATE TABLE `consents` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`consent_type` text NOT NULL,
	`status` text DEFAULT 'granted' NOT NULL,
	`ip_address` text NOT NULL,
	`sha256_hash` text NOT NULL,
	`granted_at` integer NOT NULL,
	`withdrawn_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`file_name` text NOT NULL,
	`r2_key` text NOT NULL,
	`version` text DEFAULT 'v1.0' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`courier_name` text,
	`courier_tracking_number` text,
	`courier_status` text DEFAULT 'not_applicable' NOT NULL,
	`uploaded_at` integer NOT NULL,
	`verified_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_r2_key_unique` ON `documents` (`r2_key`);--> statement-breakpoint
CREATE TABLE `engagements` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`division` text NOT NULL,
	`title` text NOT NULL,
	`stage_key` text NOT NULL,
	`counselor_id` text,
	`outstanding_balance` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stage_key`) REFERENCES `pipeline_stages`(`key`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`counselor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pipeline_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`sequence` integer NOT NULL,
	`wip_limit` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pipeline_stages_key_unique` ON `pipeline_stages` (`key`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'counselor' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);