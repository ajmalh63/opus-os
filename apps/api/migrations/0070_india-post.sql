ALTER TABLE `transit_shipments` ADD `article_type` text;--> statement-breakpoint
ALTER TABLE `transit_shipments` ADD `weight_grams` integer;--> statement-breakpoint
ALTER TABLE `transit_shipments` ADD `tariff_paise` integer;--> statement-breakpoint
ALTER TABLE `transit_shipments` ADD `label_url` text;--> statement-breakpoint
ALTER TABLE `transit_shipments` ADD `raw_json` text;