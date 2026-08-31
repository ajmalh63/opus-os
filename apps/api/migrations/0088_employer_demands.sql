PRAGMA foreign_keys = OFF;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `employer_demands` (
  `id` text PRIMARY KEY NOT NULL,
  `company_name` text NOT NULL,
  `contact_name` text NOT NULL,
  `work_email` text NOT NULL,
  `phone` text NOT NULL,
  `industry` text NOT NULL,
  `position_type` text NOT NULL,
  `number_of_positions` integer NOT NULL,
  `urgency` text NOT NULL,
  `engagement_type` text NOT NULL,
  `pay_range` text NOT NULL,
  `job_description` text NOT NULL,
  `jd_file_key` text,
  `decision_maker` text,
  `status` text DEFAULT 'new' NOT NULL,
  `source` text DEFAULT 'website-hire' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `employer_demands_status_idx` ON `employer_demands` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `employer_demands_industry_idx` ON `employer_demands` (`industry`);
