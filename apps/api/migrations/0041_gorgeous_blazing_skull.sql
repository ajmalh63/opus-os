PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_study_abroad_shortlists` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`university_id` text NOT NULL,
	`status` text DEFAULT 'shortlisted' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`university_id`) REFERENCES `universities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_study_abroad_shortlists`("id", "client_id", "university_id", "status", "notes", "created_at", "updated_at") SELECT "id", "client_id", "university_id", "status", "notes", "created_at", "updated_at" FROM `study_abroad_shortlists`;--> statement-breakpoint
DROP TABLE `study_abroad_shortlists`;--> statement-breakpoint
ALTER TABLE `__new_study_abroad_shortlists` RENAME TO `study_abroad_shortlists`;--> statement-breakpoint
PRAGMA foreign_keys=ON;