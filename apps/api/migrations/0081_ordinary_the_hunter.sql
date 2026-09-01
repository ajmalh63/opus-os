PRAGMA foreign_keys = OFF;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `manpower_workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`country` text NOT NULL,
	`country_name` text NOT NULL,
	`stages_json` text DEFAULT '[]' NOT NULL,
	`required_docs_json` text DEFAULT '[]' NOT NULL,
	`medical_type` text DEFAULT 'wafid' NOT NULL,
	`visa_steps_json` text DEFAULT '[]' NOT NULL,
	`sla_days` integer DEFAULT 45 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `manpower_workflows_country_unique` ON `manpower_workflows` (`country`);
--> statement-breakpoint
ALTER TABLE `employer_demands` ADD `blind_bridge` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `employer_demands` ADD `country` text;