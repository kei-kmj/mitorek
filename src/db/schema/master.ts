import {
	check,
	index,
	integer,
	real,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { now, oneOf } from "./common";

// ------------------------------------------------------------
// ゲーム / プリセットの束 ('dqw', 'pokefuta' …)
// ------------------------------------------------------------

export const games = sqliteTable("games", {
	/** 自然キー: 'dqw' */
	id: text("id").primaryKey(),
	/** 表示名 (固有名の扱いは公開時に判断) */
	name: text("name").notNull(),
	sourceUrl: text("source_url"),
	note: text("note"),
});

// ------------------------------------------------------------
// 地方区分。prefectures.region_id から参照
// ------------------------------------------------------------

export const regions = sqliteTable("regions", {
	/** 'hokkaido' | 'tohoku' | 'kanto' | … | 'tw-north' */
	id: text("id").primaryKey(),
	/** 表示名 (北海道 / 東北 / …) */
	name: text("name").notNull(),
	sortOrder: integer("sort_order").notNull().default(0),
});

// ------------------------------------------------------------
// 静的マスタ: 都道府県 (台湾の県市も同じ表に入れる)
// ------------------------------------------------------------

export const prefectures = sqliteTable(
	"prefectures",
	{
		/** 'JP-20' (長野), 'TW-TPE' (台北) */
		code: text("code").primaryKey(),
		/** ISO 3166-1 alpha-2 */
		countryCode: text("country_code").notNull(),
		/** 原語名 */
		name: text("name").notNull(),
		/** 所属する地方 (ゲーム内区分。三重=近畿) */
		regionId: text("region_id")
			.notNull()
			.references(() => regions.id),
		sortOrder: integer("sort_order").notNull(),
	},
	(table) => [index("ix_prefectures_region").on(table.regionId)],
);

// ------------------------------------------------------------
// コレクション (城 / お土産 / まものランド / 里 …)
//   コレクション内の小分けは spots.group_key で持つ (階層は作らない)
// ------------------------------------------------------------

export const collections = sqliteTable("collections", {
	/** 自然キー: '<game_id>.<種別>' ('dqw.souvenir') */
	id: text("id").primaryKey(),
	gameId: text("game_id")
		.notNull()
		.references(() => games.id),
	name: text("name").notNull(),
	description: text("description"),
	/** 絵文字コードポイント ('1f3ef' 等)。色は持たない */
	icon: text("icon"),
	sortOrder: integer("sort_order").notNull().default(0),
	createdAt: text("created_at").notNull().default(now),
	updatedAt: text("updated_at").notNull().default(now),
});

// ------------------------------------------------------------
// スポット (ゲーム内の 1 地点 = 1 行)
// ------------------------------------------------------------

export const coordSources = ["geocode", "manual", "gps"] as const;

export const spots = sqliteTable(
	"spots",
	{
		/** ULID (同名スポットがあるため自然キーは作れない) */
		id: text("id").primaryKey(),
		collectionId: text("collection_id")
			.notNull()
			.references(() => collections.id, { onDelete: "cascade" }),
		/** コレクション内の小分け (season-1 / taiwan / event)。表示名は辞書で */
		groupKey: text("group_key"),
		/** ゲーム内表記 (台湾スポットも日本語版の表記) */
		name: text("name").notNull(),
		/** ふりがな (検索・五十音順用) */
		nameKana: text("name_kana"),
		/** 地方は prefectures.region_id で導出 */
		prefectureCode: text("prefecture_code").references(() => prefectures.code),
		/** 住所 (ジオコーディングの元。画面にも表示) */
		address: text("address"),
		lat: real("lat").notNull(),
		lng: real("lng").notNull(),
		/** 現在の lat/lng の由来。gps は自分の visits の座標で上書きしたもの */
		coordSource: text("coord_source", { enum: coordSources })
			.notNull()
			.default("geocode"),
		/** 公式ページ。OGP のリンクカード用 */
		officialUrl: text("official_url"),
		/** そこで得られるもの (お土産名など) */
		reward: text("reward"),
		/** 季節事情・移動注記など自由記述 */
		note: text("note"),
		/** 論理削除 (スポット廃止等) */
		retiredAt: text("retired_at"),
		importedAt: text("imported_at").notNull().default(now),
		updatedAt: text("updated_at").notNull().default(now),
	},
	(table) => [
		index("ix_spots_collection").on(table.collectionId, table.groupKey),
		/** 矩形絞り込み用 */
		index("ix_spots_latlng").on(table.lat, table.lng),
		index("ix_spots_area").on(table.prefectureCode),
		check("spots_coord_source_check", oneOf(table.coordSource, coordSources)),
	],
);
