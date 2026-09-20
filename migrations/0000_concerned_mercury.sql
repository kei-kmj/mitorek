CREATE TABLE `custom_places` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`name` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`memo` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "custom_places_kind_check" CHECK("custom_places"."kind" IN ('hotel', 'parking', 'other'))
);
--> statement-breakpoint
CREATE INDEX `ix_custom_places_user` ON `custom_places` (`user_id`);--> statement-breakpoint
CREATE TABLE `days` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`date` text NOT NULL,
	`memo` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `days_trip_id_date_unique` ON `days` (`trip_id`,`date`);--> statement-breakpoint
CREATE TABLE `legs` (
	`id` text PRIMARY KEY NOT NULL,
	`from_stop_id` text NOT NULL,
	`to_stop_id` text NOT NULL,
	`mode` text DEFAULT 'train' NOT NULL,
	`depart_time` text,
	`arrive_time` text,
	`url` text,
	`url_generated` integer DEFAULT false NOT NULL,
	`memo` text,
	FOREIGN KEY (`from_stop_id`) REFERENCES `stops`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_stop_id`) REFERENCES `stops`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "legs_mode_check" CHECK("legs"."mode" IN ('train', 'bus', 'walk', 'car', 'taxi', 'ferry', 'bike', 'other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legs_from_stop_id_unique` ON `legs` (`from_stop_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `legs_to_stop_id_unique` ON `legs` (`to_stop_id`);--> statement-breakpoint
CREATE TABLE `links` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text,
	`day_id` text,
	`stop_id` text,
	`kind` text DEFAULT 'other' NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`generated` integer DEFAULT false NOT NULL,
	`memo` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`day_id`) REFERENCES `days`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stop_id`) REFERENCES `stops`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "links_kind_check" CHECK("links"."kind" IN ('route', 'hotel', 'ticket', 'other')),
	CONSTRAINT "links_target_check" CHECK(("links"."trip_id" IS NOT NULL) + ("links"."day_id" IS NOT NULL) + ("links"."stop_id" IS NOT NULL) = 1)
);
--> statement-breakpoint
CREATE INDEX `ix_links_trip` ON `links` (`trip_id`);--> statement-breakpoint
CREATE INDEX `ix_links_day` ON `links` (`day_id`);--> statement-breakpoint
CREATE INDEX `ix_links_stop` ON `links` (`stop_id`);--> statement-breakpoint
CREATE TABLE `stops` (
	`id` text PRIMARY KEY NOT NULL,
	`day_id` text NOT NULL,
	`seq` integer NOT NULL,
	`spot_id` text,
	`station_id` text,
	`custom_place_id` text,
	`arrive_time` text,
	`depart_time` text,
	`approach_memo` text,
	`memo` text,
	FOREIGN KEY (`day_id`) REFERENCES `days`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`spot_id`) REFERENCES `spots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`custom_place_id`) REFERENCES `custom_places`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stops_target_check" CHECK(("stops"."spot_id" IS NOT NULL) + ("stops"."station_id" IS NOT NULL) + ("stops"."custom_place_id" IS NOT NULL) = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stops_day_id_seq_unique` ON `stops` (`day_id`,`seq`);--> statement-breakpoint
CREATE TABLE `trips` (
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
	CONSTRAINT "trips_status_check" CHECK("trips"."status" IN ('planning', 'confirmed', 'postponed', 'cancelled')),
	CONSTRAINT "trips_visibility_check" CHECK("trips"."visibility" IN ('private', 'unlisted', 'public')),
	CONSTRAINT "trips_dates_check" CHECK("trips"."status" = 'postponed' OR ("trips"."start_date" IS NOT NULL AND "trips"."end_date" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `ix_trips_user` ON `trips` (`user_id`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source_url` text,
	`note` text
);
--> statement-breakpoint
CREATE TABLE `prefectures` (
	`code` text PRIMARY KEY NOT NULL,
	`country_code` text NOT NULL,
	`name` text NOT NULL,
	`region_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_prefectures_region` ON `prefectures` (`region_id`);--> statement-breakpoint
CREATE TABLE `regions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spots` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`group_key` text,
	`name` text NOT NULL,
	`name_kana` text,
	`prefecture_code` text,
	`address` text,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`coord_source` text DEFAULT 'geocode' NOT NULL,
	`official_url` text,
	`reward` text,
	`note` text,
	`retired_at` text,
	`imported_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prefecture_code`) REFERENCES `prefectures`(`code`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "spots_coord_source_check" CHECK("spots"."coord_source" IN ('geocode', 'manual', 'gps'))
);
--> statement-breakpoint
CREATE INDEX `ix_spots_collection` ON `spots` (`collection_id`,`group_key`);--> statement-breakpoint
CREATE INDEX `ix_spots_latlng` ON `spots` (`lat`,`lng`);--> statement-breakpoint
CREATE INDEX `ix_spots_area` ON `spots` (`prefecture_code`);--> statement-breakpoint
CREATE TABLE `lines` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_code` text NOT NULL,
	`operator_id` text,
	`country_code` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`operator_id`) REFERENCES `operators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lines_source_source_code_unique` ON `lines` (`source`,`source_code`);--> statement-breakpoint
CREATE TABLE `operators` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_code` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operators_source_source_code_unique` ON `operators` (`source`,`source_code`);--> statement-breakpoint
CREATE TABLE `spot_stations` (
	`spot_id` text NOT NULL,
	`station_id` text NOT NULL,
	`distance_m` real NOT NULL,
	PRIMARY KEY(`spot_id`, `station_id`),
	FOREIGN KEY (`spot_id`) REFERENCES `spots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_spot_stations_station` ON `spot_stations` (`station_id`);--> statement-breakpoint
CREATE TABLE `station_lines` (
	`station_id` text NOT NULL,
	`line_id` text NOT NULL,
	PRIMARY KEY(`station_id`, `line_id`),
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`line_id`) REFERENCES `lines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `stations` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_code` text NOT NULL,
	`name` text NOT NULL,
	`prefecture_code` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	FOREIGN KEY (`prefecture_code`) REFERENCES `prefectures`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ix_stations_latlng` ON `stations` (`lat`,`lng`);--> statement-breakpoint
CREATE UNIQUE INDEX `stations_source_source_code_unique` ON `stations` (`source`,`source_code`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_user_id` text,
	`email` text NOT NULL,
	`display_name` text,
	`status` text DEFAULT 'invited' NOT NULL,
	`home_lat` real,
	`home_lng` real,
	`home_radius_km` real,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT "users_status_check" CHECK("users"."status" IN ('invited', 'active', 'suspended'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_auth_user_id_unique` ON `users` (`auth_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `visit_images` (
	`id` text PRIMARY KEY NOT NULL,
	`visit_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`caption` text,
	`seq` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visit_images_r2_key_unique` ON `visit_images` (`r2_key`);--> statement-breakpoint
CREATE INDEX `ix_visit_images_visit` ON `visit_images` (`visit_id`);--> statement-breakpoint
CREATE TABLE `visits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`spot_id` text NOT NULL,
	`visited_at` text,
	`lat` real,
	`lng` real,
	`memo` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`spot_id`) REFERENCES `spots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_visits_user_spot` ON `visits` (`user_id`,`spot_id`);