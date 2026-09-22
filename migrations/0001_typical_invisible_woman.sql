-- 手で直した (trips.status に 'completed' を足すための作り直し)。
-- drizzle-kit が出す PRAGMA foreign_keys=OFF は D1 では効かず、defer_foreign_keys でも ON DELETE CASCADE は
-- 止まらない。そのままだと DROP TABLE trips が days / stops / legs / links を消す (test/migrations.test.ts で確認)。
-- そこで、trips を参照する表を退避してから作り直し、依存の順 (days → stops → legs → links) に戻す
CREATE TABLE `_keep_days` AS SELECT * FROM `days`;--> statement-breakpoint
CREATE TABLE `_keep_stops` AS SELECT * FROM `stops`;--> statement-breakpoint
CREATE TABLE `_keep_legs` AS SELECT * FROM `legs`;--> statement-breakpoint
CREATE TABLE `_keep_links` AS SELECT * FROM `links`;--> statement-breakpoint
CREATE TABLE `__new_trips` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`status` text DEFAULT 'planning' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`memo` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "trips_status_check" CHECK("__new_trips"."status" IN ('planning', 'confirmed', 'completed', 'postponed', 'cancelled')),
	CONSTRAINT "trips_visibility_check" CHECK("__new_trips"."visibility" IN ('private', 'unlisted', 'public')),
	CONSTRAINT "trips_dates_check" CHECK("__new_trips"."status" = 'postponed' OR ("__new_trips"."start_date" IS NOT NULL AND "__new_trips"."end_date" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_trips`("id", "user_id", "title", "start_date", "end_date", "status", "visibility", "memo", "created_at", "updated_at") SELECT "id", "user_id", "title", "start_date", "end_date", "status", "visibility", "memo", "created_at", "updated_at" FROM `trips`;--> statement-breakpoint
DROP TABLE `trips`;--> statement-breakpoint
ALTER TABLE `__new_trips` RENAME TO `trips`;--> statement-breakpoint
INSERT INTO `days` SELECT * FROM `_keep_days`;--> statement-breakpoint
INSERT INTO `stops` SELECT * FROM `_keep_stops`;--> statement-breakpoint
INSERT INTO `legs` SELECT * FROM `_keep_legs`;--> statement-breakpoint
INSERT INTO `links` SELECT * FROM `_keep_links`;--> statement-breakpoint
DROP TABLE `_keep_days`;--> statement-breakpoint
DROP TABLE `_keep_stops`;--> statement-breakpoint
DROP TABLE `_keep_legs`;--> statement-breakpoint
DROP TABLE `_keep_links`;--> statement-breakpoint
CREATE INDEX `ix_trips_user` ON `trips` (`user_id`);