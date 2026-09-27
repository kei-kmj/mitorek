import {
	and,
	asc,
	eq,
	exists,
	isNull,
	lte,
	not,
	type SQL,
	sql,
} from "drizzle-orm";
import { type Db, qb } from "../db/client";
import { spots } from "../db/schema/master";
import { visits } from "../db/schema/visits";
import type { UserId } from "../env";
import { bboxAround } from "../lib/geo";
import { haversineM, withinBbox } from "../lib/geo-sql";
import type { GeoPoint } from "../schemas/geo";
import type { NearbySpot, Spot, SpotListQuery } from "../schemas/spots";

// ---- 「訪問済み」の定義はここ 1 か所。列にも条件にも同じ式を使う ----
const visitedBy = (userId: UserId): SQL =>
	exists(
		qb
			.select({ one: sql`1` })
			.from(visits)
			.where(and(eq(visits.spotId, spots.id), eq(visits.userId, userId))),
	);

/** SQLite の真偽値 (0/1) は mapWith(Boolean) で boolean に戻す */
const spotColumns = (userId: UserId) => ({
	collectionId: spots.collectionId,
	groupKey: spots.groupKey,
	id: spots.id,
	lat: spots.lat,
	lng: spots.lng,
	name: spots.name,
	note: spots.note,
	officialUrl: spots.officialUrl,
	prefectureCode: spots.prefectureCode,
	retired: sql<boolean>`${spots.retiredAt} IS NOT NULL`.mapWith(Boolean),
	reward: spots.reward,
	visited: sql<boolean>`${visitedBy(userId)}`.mapWith(Boolean),
});

// ---- 絞り込み条件 → SQL の対応表。条件を足すときは SpotListQuery に項目を足し、ここに 1 行足す ----
type Filters = {
	[K in keyof SpotListQuery]-?: (
		v: NonNullable<SpotListQuery[K]>,
		userId: UserId,
	) => SQL | undefined;
};
const filters: Filters = {
	bbox: (b) => withinBbox(b, spots.lat, spots.lng),
	collection: (id) => eq(spots.collectionId, id),
	pref: (code) => eq(spots.prefectureCode, code),
	unvisited: (on, userId) => {
		if (!on) {
			return;
		}
		return not(visitedBy(userId));
	},
};

const conditionsFrom = (q: SpotListQuery, userId: UserId) =>
	(Object.keys(filters) as (keyof Filters)[])
		.filter((k) => q[k] !== undefined)
		.map((k) => filters[k](q[k] as never, userId));

// ---- 一覧 ----
export const listSpots = (
	db: Db,
	userId: UserId,
	q: SpotListQuery,
): Promise<Spot[]> =>
	db
		.select(spotColumns(userId))
		.from(spots)
		.where(and(isNull(spots.retiredAt), ...conditionsFrom(q, userId)))
		.orderBy(asc(spots.name));

// ---- 近傍 (未訪問のみ) ----
export const findNearbyUnvisited = (
	db: Db,
	userId: UserId,
	center: GeoPoint,
	radiusM: number,
): Promise<NearbySpot[]> => {
	const distanceM = haversineM(center, spots.lat, spots.lng).mapWith(Number);
	return db
		.select({ ...spotColumns(userId), distanceM })
		.from(spots)
		.where(
			and(
				isNull(spots.retiredAt),
				withinBbox(bboxAround(center, radiusM), spots.lat, spots.lng),
				not(visitedBy(userId)),
				lte(distanceM, radiusM),
			),
		)
		.orderBy(asc(distanceM));
};

// ---- 単体 (廃止済みも返す。retired で判別) ----
export const findSpot = (
	db: Db,
	userId: UserId,
	id: string,
): Promise<Spot | undefined> =>
	db.select(spotColumns(userId)).from(spots).where(eq(spots.id, id)).get();

export { visitedBy };
