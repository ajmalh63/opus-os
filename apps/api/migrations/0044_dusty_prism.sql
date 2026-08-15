ALTER TABLE `job_postings` ADD `description` text;--> statement-breakpoint
ALTER TABLE `job_postings` ADD `employer` text;--> statement-breakpoint
ALTER TABLE `job_postings` ADD `employer_reference` text;--> statement-breakpoint
ALTER TABLE `job_postings` ADD `salary_min_paise` integer;--> statement-breakpoint
ALTER TABLE `job_postings` ADD `salary_max_paise` integer;--> statement-breakpoint
ALTER TABLE `job_postings` ADD `currency` text DEFAULT 'AED' NOT NULL;--> statement-breakpoint
ALTER TABLE `job_postings` ADD `vacancies` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `job_postings` ADD `benefits_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `job_postings` ADD `requirements_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `job_postings` ADD `experience_years_min` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `job_postings` ADD `age_min` integer;--> statement-breakpoint
ALTER TABLE `job_postings` ADD `age_max` integer;--> statement-breakpoint
ALTER TABLE `job_postings` ADD `trade_category` text;--> statement-breakpoint
ALTER TABLE `job_postings` ADD `visa_provided` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `job_postings` ADD `medical_required` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `job_postings` ADD `deadline` integer;--> statement-breakpoint
ALTER TABLE `job_postings` ADD `featured` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `manpower_deployments` ADD `form_json` text;--> statement-breakpoint
ALTER TABLE `manpower_deployments` ADD `resume_key` text;--> statement-breakpoint
ALTER TABLE `manpower_deployments` ADD `applied_at` integer;--> statement-breakpoint
ALTER TABLE `manpower_deployments` ADD `rejection_reason` text;