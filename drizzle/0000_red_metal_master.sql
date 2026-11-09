CREATE TABLE `chef_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`state` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chef_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`phase` text NOT NULL,
	`data` text NOT NULL,
	`error` text,
	`lease` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chef_nutrient_cache` (
	`name` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chef_receipts` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`at` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
