import {
	index,
	integer,
	real,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { now } from "./common";
import { spots } from "./master";
import { users } from "./users";

// ------------------------------------------------------------
// 訪問記録 (イベント。同じスポットに複数回あってよい)
// ------------------------------------------------------------

export const visits = sqliteTable(
	"visits",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		spotId: text("spot_id")
			.notNull()
			.references(() => spots.id, { onDelete: "cascade" }),
		/** NULL 可 (過去分の一括登録で日付不明のとき) */
		visitedAt: text("visited_at"),
		/** 記録時の位置 (任意) */
		lat: real("lat"),
		lng: real("lng"),
		/** Markdown */
		memo: text("memo"),
		createdAt: text("created_at").notNull().default(now),
	},
	(table) => [index("ix_visits_user_spot").on(table.userId, table.spotId)],
);

/** 訪問写真。本体は R2、ここはキーとキャプション。アップロード時に EXIF を除去する */
export const visitImages = sqliteTable(
	"visit_images",
	{
		id: text("id").primaryKey(),
		visitId: text("visit_id")
			.notNull()
			.references(() => visits.id, { onDelete: "cascade" }),
		r2Key: text("r2_key").notNull().unique(),
		caption: text("caption"),
		seq: integer("seq").notNull().default(0),
		createdAt: text("created_at").notNull().default(now),
	},
	(table) => [index("ix_visit_images_visit").on(table.visitId)],
);
