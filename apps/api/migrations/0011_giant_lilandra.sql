CREATE TABLE `attestation_chains` (
	`id` text PRIMARY KEY NOT NULL,
	`country` text NOT NULL,
	`steps_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_postings` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`country` text NOT NULL,
	`sector` text NOT NULL,
	`salary_text` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `universities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`country` text NOT NULL,
	`min_gpa` real DEFAULT 0 NOT NULL,
	`ielts_min` real DEFAULT 0 NOT NULL,
	`budget_lpa_min` real DEFAULT 0 NOT NULL,
	`intake` text DEFAULT 'Fall 2027' NOT NULL,
	`created_at` integer NOT NULL
);
