CREATE TABLE `aeo_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`engine` text NOT NULL,
	`query` text NOT NULL,
	`mentioned` integer DEFAULT false NOT NULL,
	`snippet` text,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `aeo_passages` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`target_query` text NOT NULL,
	`passage` text NOT NULL,
	`stats` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ga_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_name` text NOT NULL,
	`page` text,
	`source` text,
	`medium` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gbp_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`scheduled_at` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gbp_profile` (
	`id` text PRIMARY KEY DEFAULT 'main' NOT NULL,
	`name` text,
	`category` text,
	`address` text,
	`phone` text,
	`website` text,
	`hours_json` text,
	`attributes_json` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gbp_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text DEFAULT 'google' NOT NULL,
	`rating` integer NOT NULL,
	`author` text,
	`text` text,
	`sentiment` text,
	`responded` integer DEFAULT false NOT NULL,
	`response_draft` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `report_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`report_type` text NOT NULL,
	`period` text DEFAULT 'monthly' NOT NULL,
	`recipients` text,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `seo_keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`keyword` text NOT NULL,
	`target_url` text,
	`volume` integer,
	`position` integer,
	`impressions` integer,
	`clicks` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `seo_pages` (
	`route` text PRIMARY KEY NOT NULL,
	`title` text,
	`meta_description` text,
	`og_title` text,
	`og_image` text,
	`schema_json` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `utm_events` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`source` text,
	`medium` text,
	`campaign` text,
	`landed_at` integer NOT NULL,
	`converted_at` integer
);
