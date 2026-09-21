import { type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import type { UserId } from "../env";
import { bboxAround } from "../lib/geo";
import { haversineM, withinBbox } from "../lib/geo-sql";
import type { GeoPoint } from "../schemas/geo";
import type { NearbySpot, Spot, SpotListQuery } from "../schemas/spots";

type Row = Record<string, unknown>;

// ---- 「訪問済み」の定義はここ 1 か所。列にも条件にも同じ式を使う (spots の別名は s) ----
const visitedBy = (userId: UserId): SQL =>
	sql`EXISTS (SELECT 1 FROM visits v WHERE v.spot_id = s.id AND v.user_id = ${userId})`;

const spotColumns = (userId: UserId) => sql`
  s.id, s.collection_id AS collectionId, s.group_key AS groupKey, s.name,
  s.prefecture_code AS prefectureCode, s.lat, s.lng, s.reward, s.official_url AS officialUrl, s.note,
  (s.retired_at IS NOT NULL) AS retired,
  ${visitedBy(userId)} AS visited`;

/** SQLite の真偽値 (0/1) を boolean に戻す */
const toSpot = (r: Row): Spot =>
	({ ...r, retired: r.retired === 1, visited: r.visited === 1 }) as Spot;

// ---- 絞り込み条件 → SQL の対応表。条件を足すときは SpotListQuery に項目を足し、ここに 1 行足す ----
type Filters = {
	[K in keyof SpotListQuery]-?: (
		v: NonNullable<SpotListQuery[K]>,
		userId: UserId,
	) => SQL;
};
const filters: Filters = {
	bbox: (b) => withinBbox(b, sql`s.lat`, sql`s.lng`),
	collection: (id) => sql`s.collection_id = ${id}`,
	pref: (code) => sql`s.prefecture_code = ${code}`,
	unvisited: (on, userId) => {
		if (!on) {
			return sql`1 = 1`;
		}
		return sql`NOT ${visitedBy(userId)}`;
	},
};

const conditionsFrom = (q: SpotListQuery, userId: UserId): SQL[] =>
	(Object.keys(filters) as (keyof Filters)[])
		.filter((k) => q[k] !== undefined)
		.map((k) => filters[k](q[k] as never, userId));

// ---- 一覧 ----
export const listSpots = async (
	db: Db,
	userId: UserId,
	q: SpotListQuery,
): Promise<Spot[]> => {
	const conditions = [sql`s.retired_at IS NULL`, ...conditionsFrom(q, userId)];
	const rows = await db.all<Row>(
		sql`SELECT ${spotColumns(userId)} FROM spots s WHERE ${sql.join(conditions, sql` AND `)} ORDER BY s.name`,
	);
	return rows.map(toSpot);
};

// ---- 近傍 (未訪問のみ) ----
export const findNearbyUnvisited = async (
	db: Db,
	userId: UserId,
	center: GeoPoint,
	radiusM: number,
): Promise<NearbySpot[]> => {
	const rows = await db.all<Row>(sql`
    SELECT * FROM (
      SELECT ${spotColumns(userId)}, ${haversineM(center, sql`s.lat`, sql`s.lng`)} AS distanceM
      FROM spots s
      WHERE s.retired_at IS NULL
        AND ${withinBbox(bboxAround(center, radiusM), sql`s.lat`, sql`s.lng`)}
        AND NOT ${visitedBy(userId)}
    ) WHERE distanceM <= ${radiusM}
    ORDER BY distanceM`);
	return rows.map(toSpot) as NearbySpot[];
};

// ---- 単体 (廃止済みも返す。retired で判別) ----
export const findSpot = async (
	db: Db,
	userId: UserId,
	id: string,
): Promise<Spot | undefined> => {
	const row = await db.get<Row>(
		sql`SELECT ${spotColumns(userId)} FROM spots s WHERE s.id = ${id}`,
	);
	return row && toSpot(row);
};

export { visitedBy };
