CREATE TABLE `transit_shipments` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`courier_partner` text NOT NULL,
	`tracking_number` text NOT NULL,
	`status` text DEFAULT 'pickup' NOT NULL,
	`shipping_address` text NOT NULL,
	`estimated_delivery` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
