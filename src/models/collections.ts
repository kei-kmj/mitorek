import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import type { UserId } from "../env";
import type { Collection } from "../schemas/collections";
import { visitedBy } from "./spots";

/** 全コレクションを表示順に。スポット数と自分の訪問済み数を添える */
export const listCollections = (
	db: Db,
	userId: UserId,
): Promise<Collection[]> =>
	db.all<Collection>(sql`
    SELECT c.id, c.name, c.icon,
      count(s.id) AS total,
      count(CASE WHEN ${visitedBy(userId)} THEN 1 END) AS visited
    FROM collections c
    LEFT JOIN spots s ON s.collection_id = c.id AND s.retired_at IS NULL
    GROUP BY c.id
    ORDER BY c.sort_order, c.id`);
