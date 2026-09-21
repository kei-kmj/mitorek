import { check, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { now, oneOf } from "./common";

export const userStatuses = ["invited", "active", "suspended"] as const;

export const users = sqliteTable(
	"users",
	{
		/** 自前の ULID。認証基盤の ID は使わない */
		id: text("id").primaryKey(),
		/** 認証基盤 (better-auth 等) 側のユーザー ID。差し替え可能にするため分離 */
		authUserId: text("auth_user_id").unique(),
		email: text("email").notNull().unique(),
		displayName: text("display_name"),
		status: text("status", { enum: userStatuses }).notNull().default("invited"),
		/** 公開処理での除外用。本人以外に出さない */
		homeLat: real("home_lat"),
		homeLng: real("home_lng"),
		homeRadiusKm: real("home_radius_km"),
		createdAt: text("created_at").notNull().default(now),
		updatedAt: text("updated_at").notNull().default(now),
	},
	(table) => [check("users_status_check", oneOf(table.status, userStatuses))],
);
