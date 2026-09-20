import {
	index,
	primaryKey,
	real,
	sqliteTable,
	text,
	unique,
} from "drizzle-orm/sqlite-core";
import { prefectures, spots } from "./master.ts";

// ------------------------------------------------------------
// 鉄道マスタ (日本: 駅データ.jp / 国土数値情報, 台湾: TDX から取り込み)
// ------------------------------------------------------------

export const operators = sqliteTable(
	"operators",
	{
		/** 自前の ULID */
		id: text("id").primaryKey(),
		/** 取り込み元: 'ekidata' | 'ksj' | 'tdx' */
		source: text("source").notNull(),
		/** 取り込み元の事業者コード */
		sourceCode: text("source_code").notNull(),
		/** JR東日本, アルピコ交通 … */
		name: text("name").notNull(),
	},
	(table) => [unique().on(table.source, table.sourceCode)],
);

export const lines = sqliteTable(
	"lines",
	{
		id: text("id").primaryKey(),
		source: text("source").notNull(),
		sourceCode: text("source_code").notNull(),
		operatorId: text("operator_id").references(() => operators.id),
		countryCode: text("country_code").notNull(),
		name: text("name").notNull(),
	},
	(table) => [unique().on(table.source, table.sourceCode)],
);

export const stations = sqliteTable(
	"stations",
	{
		id: text("id").primaryKey(),
		source: text("source").notNull(),
		sourceCode: text("source_code").notNull(),
		name: text("name").notNull(),
		/** 国は prefectures.country_code で導出 */
		prefectureCode: text("prefecture_code")
			.notNull()
			.references(() => prefectures.code),
		lat: real("lat").notNull(),
		lng: real("lng").notNull(),
	},
	(table) => [
		unique().on(table.source, table.sourceCode),
		index("ix_stations_latlng").on(table.lat, table.lng),
	],
);

export const stationLines = sqliteTable(
	"station_lines",
	{
		stationId: text("station_id")
			.notNull()
			.references(() => stations.id, { onDelete: "cascade" }),
		lineId: text("line_id")
			.notNull()
			.references(() => lines.id, { onDelete: "cascade" }),
	},
	(table) => [primaryKey({ columns: [table.stationId, table.lineId] })],
);

/** スポット↔駅 (多対多)。取り込み時に一定距離内の駅を全部紐付ける */
export const spotStations = sqliteTable(
	"spot_stations",
	{
		spotId: text("spot_id")
			.notNull()
			.references(() => spots.id, { onDelete: "cascade" }),
		stationId: text("station_id")
			.notNull()
			.references(() => stations.id, { onDelete: "cascade" }),
		/** 直線距離 */
		distanceM: real("distance_m").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.spotId, table.stationId] }),
		index("ix_spot_stations_station").on(table.stationId),
	],
);
