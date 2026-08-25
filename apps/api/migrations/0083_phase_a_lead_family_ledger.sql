-- Phase A — Lead Command Center + Family Hub + WhatsApp Outbox + Installment Ledger
-- Add scoring/routing/SLA columns to clients (lead is client in Opus OS)
ALTER TABLE `clients` ADD COLUMN `lead_score` integer NOT NULL DEFAULT 0;
ALTER TABLE `clients` ADD COLUMN `lead_status` text NOT NULL DEFAULT 'new';
ALTER TABLE `clients` ADD COLUMN `assigned_to` text REFERENCES `users`(`id`);
ALTER TABLE `clients` ADD COLUMN `sla_due_at` integer;
ALTER TABLE `clients` ADD COLUMN `mql_at` integer;
ALTER TABLE `clients` ADD COLUMN `last_engagement_at` integer;

-- Family Hub (multi-contact)
CREATE TABLE IF NOT EXISTS `family_members` (
  `id` text PRIMARY KEY NOT NULL,
  `client_id` text NOT NULL REFERENCES `clients`(`id`) ON DELETE CASCADE,
  `relation` text NOT NULL,
  `name` text NOT NULL,
  `phone` text NOT NULL,
  `email` text,
  `is_primary_contact` integer NOT NULL DEFAULT 0,
  `can_receive_updates` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `family_members_client_idx` ON `family_members` (`client_id`);

-- WhatsApp Outbox (Cloud API v21, quality-tracked)
CREATE TABLE IF NOT EXISTS `wa_outbox` (
  `id` text PRIMARY KEY NOT NULL,
  `client_id` text REFERENCES `clients`(`id`),
  `family_member_id` text REFERENCES `family_members`(`id`),
  `to_phone` text NOT NULL,
  `direction` text NOT NULL,
  `type` text NOT NULL DEFAULT 'text',
  `template_name` text,
  `body` text NOT NULL,
  `wamid` text,
  `status` text NOT NULL DEFAULT 'queued',
  `category` text,
  `error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `wa_outbox_client_idx` ON `wa_outbox` (`client_id`);
CREATE INDEX IF NOT EXISTS `wa_outbox_to_phone_idx` ON `wa_outbox` (`to_phone`);

-- Installment Schedule (booking-tied)
CREATE TABLE IF NOT EXISTS `payment_schedules` (
  `id` text PRIMARY KEY NOT NULL,
  `client_id` text NOT NULL REFERENCES `clients`(`id`) ON DELETE CASCADE,
  `booking_id` text,
  `installment_no` integer NOT NULL,
  `total_installments` integer NOT NULL,
  `label` text NOT NULL,
  `amount` integer NOT NULL,
  `due_at` integer NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `collected_by` text REFERENCES `users`(`id`),
  `refund_reason` text,
  `refund_policy_version` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `payment_schedules_client_idx` ON `payment_schedules` (`client_id`);
CREATE INDEX IF NOT EXISTS `payment_schedules_booking_idx` ON `payment_schedules` (`booking_id`);

-- Lead Assignments audit
CREATE TABLE IF NOT EXISTS `lead_assignments` (
  `id` text PRIMARY KEY NOT NULL,
  `client_id` text NOT NULL REFERENCES `clients`(`id`) ON DELETE CASCADE,
  `from_user_id` text REFERENCES `users`(`id`),
  `to_user_id` text NOT NULL REFERENCES `users`(`id`),
  `reason` text,
  `created_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `lead_assignments_client_idx` ON `lead_assignments` (`client_id`);
