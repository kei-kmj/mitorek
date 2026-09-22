import { sql } from "drizzle-orm";
import { ulid } from "ulidx";
import type { Db } from "../db/client";
import type { UserId } from "../env";
import type { ReviewItem } from "../schemas/review";
import type { Visit } from "../schemas/visits";
import { imagesOfVisits } from "./images";
import { assertOwnTrip } from "./trip-lock";

/**
 * 訪問の日 (日本時間の暦日)。振り返りの日付だけのもの (YYYY-MM-DD) はそのまま、
 * 地図の「行った」の UTC 日時は +9 時間して日付にする
 */
const visitDay = sql`CASE WHEN length(v.visited_at) = 10 THEN v.visited_at
  ELSE date(v.visited_at, '+9 hours') END`;

type ItemRow = Omit<ReviewItem, "visits">;
type VisitRow = Omit<Visit, "images"> & { day: string };

/** おでかけプランのスポットの立ち寄りと、その日に記録済みの訪問 (写真付き) */
export const listReview = async (
	db: Db,
	userId: UserId,
	tripId: string,
): Promise<ReviewItem[]> => {
	await assertOwnTrip(db, userId, tripId);
	const items = await db.all<ItemRow>(sql`
    SELECT st.id AS stopId, d.date, sp.id AS spotId, sp.name, sp.collection_id AS collectionId
    FROM stops st JOIN days d ON d.id = st.day_id JOIN spots sp ON sp.id = st.spot_id
    WHERE d.trip_id = ${tripId}
    ORDER BY d.date, st.seq`);
	const visits = await db.all<VisitRow>(sql`
    SELECT v.id, v.spot_id AS spotId, v.visited_at AS visitedAt, v.lat, v.lng, v.memo,
      v.created_at AS createdAt, ${visitDay} AS day
    FROM visits v
    WHERE v.user_id = ${userId}
      AND v.spot_id IN (SELECT st.spot_id FROM stops st JOIN days d ON d.id = st.day_id
        WHERE d.trip_id = ${tripId} AND st.spot_id IS NOT NULL)
    ORDER BY v.visited_at`);
	const images = await imagesOfVisits(
		db,
		visits.map((v) => v.id),
	);
	return items.map((item) => ({
		...item,
		visits: visits
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
	if (unique.length > 0) {
		await db.$client.batch(
			unique.map((i) =>
				db.$client
					.prepare(
						"INSERT INTO visits (id, user_id, spot_id, visited_at) VALUES (?, ?, ?, ?)",
					)
					.bind(ulid(), userId, i.spotId, i.date),
			),
		);
	}
	return listReview(db, userId, tripId);
};
