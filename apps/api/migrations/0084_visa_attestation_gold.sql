-- Visa + Attestation Gold Standard (V1-V7, A1-A7)
CREATE TABLE IF NOT EXISTS `visa_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `country` text NOT NULL,
  `visa_type` text NOT NULL,
  `docs` text NOT NULL,
  `validity_rule` text,
  `lead_days` integer NOT NULL DEFAULT 21,
  `updated_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `visa_rules_country_type_idx` ON `visa_rules` (`country`, `visa_type`);

CREATE TABLE IF NOT EXISTS `visa_deadlines` (
  `id` text PRIMARY KEY NOT NULL,
  `client_id` text NOT NULL REFERENCES `clients`(`id`) ON DELETE CASCADE,
  `booking_id` text NOT NULL,
  `type` text NOT NULL,
  `due_at` integer NOT NULL,
  `depends_on` text,
  `status` text NOT NULL DEFAULT 'pending',
  `created_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `visa_deadlines_client_idx` ON `visa_deadlines` (`client_id`);
CREATE INDEX IF NOT EXISTS `visa_deadlines_booking_idx` ON `visa_deadlines` (`booking_id`);

CREATE TABLE IF NOT EXISTS `attestation_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `doc_type` text NOT NULL,
  `destination` text NOT NULL,
  `is_hague` integer NOT NULL DEFAULT 0,
  `chain` text NOT NULL,
  `avg_days` integer NOT NULL,
  `fee` integer,
  `updated_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `attestation_rules_doc_dest_idx` ON `attestation_rules` (`doc_type`, `destination`);

CREATE TABLE IF NOT EXISTS `attestation_verifications` (
  `id` text PRIMARY KEY NOT NULL,
  `application_id` text NOT NULL,
  `apostille_id` text,
  `e_register_url` text,
  `verification_status` text NOT NULL DEFAULT 'pending',
  `verified_at` integer,
  `created_at` integer NOT NULL
);
