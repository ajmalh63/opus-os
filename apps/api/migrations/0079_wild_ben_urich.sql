PRAGMA foreign_keys = OFF;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `attestation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`doc_type` text NOT NULL,
	`destination` text NOT NULL,
	`is_hague` integer DEFAULT false NOT NULL,
	`chain` text NOT NULL,
	`avg_days` integer NOT NULL,
	`fee` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `attestation_rules_doc_dest_idx` ON `attestation_rules` (`doc_type`,`destination`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `attestation_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`apostille_id` text,
	`e_register_url` text,
	`verification_status` text DEFAULT 'pending' NOT NULL,
	`verified_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `blog_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`division` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `blog_categories_slug_unique` ON `blog_categories` (`slug`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `blog_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`tldr` text,
	`excerpt` text,
	`content_markdown` text NOT NULL,
	`content_html` text,
	`author_id` text,
	`author_name` text,
	`division` text DEFAULT 'general' NOT NULL,
	`category` text,
	`primary_keyword` text,
	`secondary_keywords` text,
	`pillar_slug` text,
	`meta_title` text,
	`meta_description` text,
	`og_image` text,
	`canonical` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`reading_minutes` integer,
	`published_at` integer,
	`scheduled_at` integer,
	`date_modified` integer,
	`view_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `blog_posts_slug_unique` ON `blog_posts` (`slug`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `blog_posts_slug_idx` ON `blog_posts` (`slug`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `blog_posts_status_idx` ON `blog_posts` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `blog_posts_division_idx` ON `blog_posts` (`division`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `blog_posts_primary_keyword_idx` ON `blog_posts` (`primary_keyword`);--> statement-breakpoint
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
CREATE INDEX IF NOT EXISTS `employer_demands_status_idx` ON `employer_demands` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `employer_demands_industry_idx` ON `employer_demands` (`industry`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `family_members` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`relation` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`is_primary_contact` integer DEFAULT false NOT NULL,
	`can_receive_updates` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `family_members_client_idx` ON `family_members` (`client_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `feedback_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`client_name` text NOT NULL,
	`division` text DEFAULT 'general' NOT NULL,
	`rating` integer NOT NULL,
	`title` text,
	`comment` text NOT NULL,
	`feedback_type` text DEFAULT 'review' NOT NULL,
	`is_public_approved` integer DEFAULT false NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`counselor_name` text,
	`source` text DEFAULT 'native' NOT NULL,
	`external_id` text,
	`author_avatar_url` text,
	`author_location` text,
	`source_url` text,
	`is_featured` integer DEFAULT false NOT NULL,
	`verified_buyer` integer DEFAULT true NOT NULL,
	`metadata_json` text DEFAULT '{}',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feedback_rating_idx` ON `feedback_submissions` (`rating`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feedback_division_idx` ON `feedback_submissions` (`division`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feedback_public_idx` ON `feedback_submissions` (`is_public_approved`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feedback_source_idx` ON `feedback_submissions` (`source`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feedback_external_id_idx` ON `feedback_submissions` (`external_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `feedback_featured_idx` ON `feedback_submissions` (`is_featured`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `lead_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`from_user_id` text,
	`to_user_id` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lead_assignments_client_idx` ON `lead_assignments` (`client_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `payment_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`booking_id` text,
	`installment_no` integer NOT NULL,
	`total_installments` integer NOT NULL,
	`label` text NOT NULL,
	`amount` integer NOT NULL,
	`due_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`collected_by` text,
	`refund_reason` text,
	`refund_policy_version` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collected_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `payment_schedules_client_idx` ON `payment_schedules` (`client_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `payment_schedules_booking_idx` ON `payment_schedules` (`booking_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `support_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_number` text NOT NULL,
	`source` text DEFAULT 'client' NOT NULL,
	`client_id` text,
	`partner_id` text,
	`created_by_id` text,
	`creator_name` text NOT NULL,
	`creator_email` text,
	`creator_phone` text,
	`division` text DEFAULT 'general' NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`subject` text NOT NULL,
	`description` text NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`assignee_id` text,
	`sla_due_at` integer,
	`sla_paused_at` integer,
	`sla_remaining_seconds` integer,
	`first_response_at` integer,
	`resolved_at` integer,
	`closed_at` integer,
	`satisfaction_rating` integer,
	`satisfaction_feedback` text,
	`attachments_json` text DEFAULT '[]' NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `support_tickets_ticket_number_unique` ON `support_tickets` (`ticket_number`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ticket_client_idx` ON `support_tickets` (`client_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ticket_partner_idx` ON `support_tickets` (`partner_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ticket_status_idx` ON `support_tickets` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ticket_priority_idx` ON `support_tickets` (`priority`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ticket_division_idx` ON `support_tickets` (`division`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ticket_assignee_idx` ON `support_tickets` (`assignee_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ticket_created_idx` ON `support_tickets` (`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ticket_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`sender_type` text NOT NULL,
	`sender_id` text NOT NULL,
	`sender_name` text NOT NULL,
	`message` text NOT NULL,
	`is_internal_note` integer DEFAULT false NOT NULL,
	`attachments_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ticket_msg_ticket_idx` ON `ticket_messages` (`ticket_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ticket_msg_created_idx` ON `ticket_messages` (`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `visa_deadlines` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`booking_id` text NOT NULL,
	`type` text NOT NULL,
	`due_at` integer NOT NULL,
	`depends_on` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `visa_deadlines_client_idx` ON `visa_deadlines` (`client_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `visa_deadlines_booking_idx` ON `visa_deadlines` (`booking_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `visa_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`country` text NOT NULL,
	`visa_type` text NOT NULL,
	`docs` text NOT NULL,
	`validity_rule` text,
	`lead_days` integer DEFAULT 21 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `visa_rules_country_type_idx` ON `visa_rules` (`country`,`visa_type`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `wa_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`family_member_id` text,
	`to_phone` text NOT NULL,
	`direction` text NOT NULL,
	`type` text DEFAULT 'text' NOT NULL,
	`template_name` text,
	`body` text NOT NULL,
	`wamid` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`category` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`family_member_id`) REFERENCES `family_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wa_outbox_client_idx` ON `wa_outbox` (`client_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `wa_outbox_to_phone_idx` ON `wa_outbox` (`to_phone`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`password_hash` text,
	`two_factor_enabled` integer DEFAULT false NOT NULL,
	`role` text DEFAULT 'client' NOT NULL,
	`user_divisions` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`status_changed_at` integer,
	`status_changed_by` text,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`status_changed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "name", "email", "email_verified", "image", "password_hash", "two_factor_enabled", "role", "user_divisions", "status", "status_changed_at", "status_changed_by", "archived_at", "created_at", "updated_at") SELECT "id", "name", "email", "email_verified", "image", "password_hash", "two_factor_enabled", "role", "user_divisions", "status", "status_changed_at", "status_changed_by", "archived_at", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_email_unique` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `clients` ADD `lead_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `lead_status` text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `assigned_to` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `clients` ADD `sla_due_at` integer;--> statement-breakpoint
ALTER TABLE `clients` ADD `mql_at` integer;--> statement-breakpoint
ALTER TABLE `clients` ADD `last_engagement_at` integer;--> statement-breakpoint
ALTER TABLE `umrah_packages` ADD `category` text DEFAULT 'umrah_pilgrimage' NOT NULL;--> statement-breakpoint
ALTER TABLE `umrah_packages` ADD `destination_country` text;--> statement-breakpoint
ALTER TABLE `umrah_packages` ADD `destination_city` text;--> statement-breakpoint
ALTER TABLE `umrah_packages` ADD `hotel_name` text;--> statement-breakpoint
ALTER TABLE `umrah_packages` ADD `hotel_stars` integer;--> statement-breakpoint
ALTER TABLE `umrah_packages` ADD `sightseeing_highlights_json` text DEFAULT '[]' NOT NULL;