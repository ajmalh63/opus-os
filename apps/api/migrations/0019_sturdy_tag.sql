CREATE TABLE `candidate_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`skills_json` text DEFAULT '[]' NOT NULL,
	`experience_json` text DEFAULT '[]' NOT NULL,
	`education` text,
	`resume_key` text,
	`source` text DEFAULT 'ai' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
