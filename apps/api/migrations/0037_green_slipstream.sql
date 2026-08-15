CREATE TABLE `attestation_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`document_type` text NOT NULL,
	`destination_country` text NOT NULL,
	`current_step` text DEFAULT 'hrd' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `manpower_deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`job_id` text NOT NULL,
	`selection_status` text DEFAULT 'applied' NOT NULL,
	`medical_status` text DEFAULT 'pending' NOT NULL,
	`visa_status` text DEFAULT 'pending' NOT NULL,
	`flight_status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `job_postings`(`id`) ON UPDATE no action ON DELETE no action
);
