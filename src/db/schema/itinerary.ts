import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	real,
	sqliteTable,
	text,
	unique,
} from "drizzle-orm/sqlite-core";
import { now, oneOf } from "./common";
import { spots } from "./master";
import { stations } from "./rail";
import { users } from "./users";

// ------------------------------------------------------------
// 旅程: trips → days → stops
// ------------------------------------------------------------

export const tripStatuses = [
	"planning",
	"confirmed",
	"postponed",
	"cancelled",
] as const;

export const tripVisibilities = ["private", "unlisted", "public"] as const;

export const trips = sqliteTable(
	"trips",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		/** YYYY-MM-DD。延期中は NULL 可 */
		startDate: text("start_date"),
		endDate: text("end_date"),
		/** 進行中・終了は日付から導出、行ったかは visits */
		status: text("status", { enum: tripStatuses })
			.notNull()
			.default("planning"),
		/** end_date が過去のときだけ public/unlisted にできる (API で強制) */
		visibility: text("visibility", { enum: tripVisibilities })
			.notNull()
			.default("private"),
		/** Markdown */
		memo: text("memo"),
		createdAt: text("created_at").notNull().default(now),
		updatedAt: text("updated_at").notNull().default(now),
	},
	(table) => [
		index("ix_trips_user").on(table.userId),
		check("trips_status_check", oneOf(table.status, tripStatuses)),
		check("trips_visibility_check", oneOf(table.visibility, tripVisibilities)),
		check(
			"trips_dates_check",
			sql`${table.status} = 'postponed' OR (${table.startDate} IS NOT NULL AND ${table.endDate} IS NOT NULL)`,
		),
	],
);

export const days = sqliteTable(
	"days",
	{
		id: text("id").primaryKey(),
		tripId: text("trip_id")
			.notNull()
			.references(() => trips.id, { onDelete: "cascade" }),
		/** YYYY-MM-DD。日付が順序そのもの (seq は持たない) */
		date: text("date").notNull(),
		memo: text("memo"),
	},
	(table) => [unique().on(table.tripId, table.date)],
);

/** 利用者が定義する任意地点 (ホテル・駐車場・集合場所など) */
export const customPlaceKinds = ["hotel", "parking", "other"] as const;

export const customPlaces = sqliteTable(
	"custom_places",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		kind: text("kind", { enum: customPlaceKinds }).notNull().default("other"),
		name: text("name").notNull(),
		lat: real("lat").notNull(),
		lng: real("lng").notNull(),
		memo: text("memo"),
		createdAt: text("created_at").notNull().default(now),
	},
	(table) => [
		index("ix_custom_places_user").on(table.userId),
		check("custom_places_kind_check", oneOf(table.kind, customPlaceKinds)),
	],
);

/** 立ち寄り。地点は spot / station / custom_place のどれか 1 つを参照 */
export const stops = sqliteTable(
	"stops",
	{
		id: text("id").primaryKey(),
		dayId: text("day_id")
			.notNull()
			.references(() => days.id, { onDelete: "cascade" }),
		/** 日内の順序。並べ替えで振り直す */
		seq: integer("seq").notNull(),
		spotId: text("spot_id").references(() => spots.id),
		stationId: text("station_id").references(() => stations.id),
		customPlaceId: text("custom_place_id").references(() => customPlaces.id),
		/** HH:MM (任意) */
		arriveTime: text("arrive_time"),
		departTime: text("depart_time"),
		/** 到達手順の個人メモ。公開処理では常に除外 */
		approachMemo: text("approach_memo"),
		memo: text("memo"),
	},
	(table) => [
		unique().on(table.dayId, table.seq),
		check(
			"stops_target_check",
			sql`(${table.spotId} IS NOT NULL) + (${table.stationId} IS NOT NULL) + (${table.customPlaceId} IS NOT NULL) = 1`,
		),
	],
);

// ------------------------------------------------------------
// 移動 (stop 間)。from → to は同じ day の連続する stop (同一 day は API で保証)
// ------------------------------------------------------------

export const legModes = [
	"train",
	"bus",
	"walk",
	"car",
	"taxi",
	"ferry",
	"bike",
	"other",
] as const;

export const legs = sqliteTable(
	"legs",
	{
		id: text("id").primaryKey(),
		/** 日は stops.day_id で導出 */
		fromStopId: text("from_stop_id")
			.notNull()
			.references(() => stops.id, { onDelete: "cascade" }),
		toStopId: text("to_stop_id")
			.notNull()
			.references(() => stops.id, { onDelete: "cascade" }),
		mode: text("mode", { enum: legModes }).notNull().default("train"),
		/** HH:MM */
		departTime: text("depart_time"),
		arriveTime: text("arrive_time"),
		/** 経路リンク (ジョルダン等) */
		url: text("url"),
		/** 自動生成なら真 (再計算で上書き可) */
		urlGenerated: integer("url_generated", { mode: "boolean" })
			.notNull()
			.default(false),
		memo: text("memo"),
	},
	(table) => [
		unique().on(table.fromStopId),
		unique().on(table.toStopId),
		check("legs_mode_check", oneOf(table.mode, legModes)),
	],
);

// ------------------------------------------------------------
// リンク (旅に紐づく URL)。付け先は trip / day / stop のどれか 1 つ
//   3NF: day/stop から trip は導出できるので trip_id は同時に持たない
// ------------------------------------------------------------

export const linkKinds = ["route", "hotel", "ticket", "other"] as const;

export const links = sqliteTable(
	"links",
	{
		id: text("id").primaryKey(),
		/** 旅全体 (航空券・えきねっと等) */
		tripId: text("trip_id").references(() => trips.id, { onDelete: "cascade" }),
		/** その日 (Google マップ経由地 URL, 宿の予約ページなど) */
		dayId: text("day_id").references(() => days.id, { onDelete: "cascade" }),
		/** その地点 (レンタサイクル, 施設ページなど) */
		stopId: text("stop_id").references(() => stops.id, { onDelete: "cascade" }),
		kind: text("kind", { enum: linkKinds }).notNull().default("other"),
		label: text("label").notNull(),
		url: text("url").notNull(),
		/** 自動生成なら真 (並べ替え時に再生成する) */
		generated: integer("generated", { mode: "boolean" })
			.notNull()
			.default(false),
		memo: text("memo"),
		createdAt: text("created_at").notNull().default(now),
	},
	(table) => [
		index("ix_links_trip").on(table.tripId),
		index("ix_links_day").on(table.dayId),
		index("ix_links_stop").on(table.stopId),
		check("links_kind_check", oneOf(table.kind, linkKinds)),
		check(
			"links_target_check",
			sql`(${table.tripId} IS NOT NULL) + (${table.dayId} IS NOT NULL) + (${table.stopId} IS NOT NULL) = 1`,
		),
	],
);
