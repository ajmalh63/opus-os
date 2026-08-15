CREATE TABLE `visa_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`country` text NOT NULL,
	`visa_type` text NOT NULL,
	`appointment_date` integer,
	`appointment_location` text,
	`status` text DEFAULT 'document_prep' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `visa_mock_interviews` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`interviewer_id` text,
	`scheduled_at` integer NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`score` integer,
	`feedback` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`interviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
