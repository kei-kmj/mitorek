import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { collections, spots } from "../db/schema/master";
import type { UserId } from "../env";
import { visitedBy } from "./spots";

/** 全コレクションを表示順に。スポット数と自分の訪問済み数を添える */
export const listCollections = (db: Db, userId: UserId) =>
	db
		.select({
			icon: collections.icon,
			id: collections.id,
			name: collections.name,
			total: count(spots.id),
			visited: count(sql`CASE WHEN ${visitedBy(userId)} THEN 1 END`),
		})
		.from(collections)
		.leftJoin(
			spots,
			and(eq(spots.collectionId, collections.id), isNull(spots.retiredAt)),
		)
		.groupBy(collections.id)
		.orderBy(asc(collections.sortOrder), asc(collections.id));
