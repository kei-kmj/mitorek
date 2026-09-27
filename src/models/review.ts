import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { ulid } from "ulidx";
import { type Db, qb } from "../db/client";
import { days, stops } from "../db/schema/itinerary";
import { spots } from "../db/schema/master";
import { visits } from "../db/schema/visits";
import type { UserId } from "../env";
import type { ReviewItem } from "../schemas/review";
import { imagesOfVisits } from "./images";
import { assertOwnTrip } from "./trip-lock";

/**
 * 訪問の日 (日本時間の暦日)。振り返りの日付だけのもの (YYYY-MM-DD) はそのまま、
 * 地図の「行った」の UTC 日時は +9 時間して日付にする
 */
const visitDay = sql<string>`CASE WHEN length(${visits.visitedAt}) = 10 THEN ${visits.visitedAt}
  ELSE date(${visits.visitedAt}, '+9 hours') END`;

/** おでかけプランのスポットの立ち寄りと、その日に記録済みの訪問 (写真付き) */
export const listReview = async (
	db: Db,
	userId: UserId,
	tripId: string,
): Promise<ReviewItem[]> => {
	await assertOwnTrip(db, userId, tripId);
	const items = await db
		.select({
			collectionId: spots.collectionId,
			date: days.date,
			name: spots.name,
			spotId: spots.id,
			stopId: stops.id,
		})
		.from(stops)
		.innerJoin(days, eq(days.id, stops.dayId))
		.innerJoin(spots, eq(spots.id, stops.spotId))
		.where(eq(days.tripId, tripId))
		.orderBy(asc(days.date), asc(stops.seq));
	const tripSpotIds = qb
		.select({ spotId: stops.spotId })
		.from(stops)
		.innerJoin(days, eq(days.id, stops.dayId))
		.where(and(eq(days.tripId, tripId), isNotNull(stops.spotId)));
	const tripVisits = await db
		.select({
			createdAt: visits.createdAt,
			day: visitDay,
			id: visits.id,
			lat: visits.lat,
			lng: visits.lng,
			memo: visits.memo,
			spotId: visits.spotId,
			visitedAt: visits.visitedAt,
		})
		.from(visits)
		.where(and(eq(visits.userId, userId), inArray(visits.spotId, tripSpotIds)))
		.orderBy(asc(visits.visitedAt));
	const images = await imagesOfVisits(
		db,
		tripVisits.map((v) => v.id),
	);
	return items.map((item) => ({
		...item,
		visits: tripVisits
			.filter((v) => v.spotId === item.spotId && v.day === item.date)
			.map(({ day: _day, ...v }) => ({ ...v, images: images.get(v.id) ?? [] })),
	}));
};

/**
 * 選んだ立ち寄りを「行った」にする。訪問日はその立ち寄りの日 (日付だけ)。
 * このおでかけプランのスポットの立ち寄りだけを対象にし、その日に記録済みなら作らない
 */
export const confirmReview = async (
	db: Db,
	userId: UserId,
	{ stopIds, tripId }: { stopIds: string[]; tripId: string },
): Promise<ReviewItem[]> => {
	const pending = (await listReview(db, userId, tripId)).filter(
		(item) => stopIds.includes(item.stopId) && item.visits.length === 0,
	);
	// 同じ日に同じスポットの立ち寄りが 2 つあっても、訪問は 1 つ
	const unique = [
		...new Map(pending.map((i) => [`${i.spotId}@${i.date}`, i])).values(),
	];
	// 1 文にまとめると D1 のバインド数の上限 (100) にかかるので、1 件 1 文で batch にする
	const [first, ...rest] = unique.map((i) =>
		db
			.insert(visits)
			.values({ id: ulid(), spotId: i.spotId, userId, visitedAt: i.date }),
	);
	if (first) {
		await db.batch([first, ...rest]);
	}
	return listReview(db, userId, tripId);
};
