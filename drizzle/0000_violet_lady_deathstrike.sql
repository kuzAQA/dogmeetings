CREATE TABLE `pets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_name` text NOT NULL,
	`photo_key` text NOT NULL,
	`photo_type` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pets_created_at_idx` ON `pets` (`created_at`);