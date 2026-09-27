import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { customPlaces, days, legs, stops } from "../db/schema/itinerary";
import { spots } from "../db/schema/master";
import { stations } from "../db/schema/rail";
import type { UserId } from "../env";
import type { Day, Place, Stop } from "../schemas/trips";

interface StopRow {
	approachMemo: string | null;
	arriveTime: string | null;
	collectionId: string | null;
	dayId: string;
	departTime: string | null;
	id: string;
	kind: string | null;
	lat: number;
	lng: number;
	memo: string | null;
	name: string;
	placeId: string;
	type: Place["type"];
}

/** 旅程の立ち寄り (地点の名前・座標付き)。custom_places は自分のものだけ */
const stopsOf = (db: Db, userId: UserId, tripId: string): Promise<StopRow[]> =>
	db
		.select({
			approachMemo: stops.approachMemo,
			arriveTime: stops.arriveTime,
			collectionId: spots.collectionId,
			dayId: stops.dayId,
			departTime: stops.departTime,
			id: stops.id,
			kind: customPlaces.kind,
			lat: sql<number>`COALESCE(${spots.lat}, ${stations.lat}, ${customPlaces.lat})`,
			lng: sql<number>`COALESCE(${spots.lng}, ${stations.lng}, ${customPlaces.lng})`,
			memo: stops.memo,
			name: sql<string>`COALESCE(${spots.name}, ${stations.name}, ${customPlaces.name})`,
			placeId: sql<string>`COALESCE(${stops.spotId}, ${stops.stationId}, ${stops.customPlaceId})`,
			type: sql<Place["type"]>`CASE WHEN ${stops.spotId} IS NOT NULL THEN 'spot'
        WHEN ${stops.stationId} IS NOT NULL THEN 'station' ELSE 'custom' END`,
		})
		.from(stops)
		.innerJoin(days, eq(days.id, stops.dayId))
		.leftJoin(spots, eq(spots.id, stops.spotId))
		.leftJoin(stations, eq(stations.id, stops.stationId))
		.leftJoin(
			customPlaces,
			and(
				eq(customPlaces.id, stops.customPlaceId),
				eq(customPlaces.userId, userId),
			),
		)
		.where(eq(days.tripId, tripId))
		.orderBy(asc(stops.seq));

/** 旅程の移動 (出発の立ち寄りで引く) */
const legsOf = (db: Db, tripId: string) =>
	db
		.select({
			arriveTime: legs.arriveTime,
			departTime: legs.departTime,
			fromStopId: legs.fromStopId,
			id: legs.id,
			memo: legs.memo,
			mode: legs.mode,
			url: legs.url,
		})
		.from(legs)
		.innerJoin(stops, eq(stops.id, legs.fromStopId))
		.innerJoin(days, eq(days.id, stops.dayId))
		.where(eq(days.tripId, tripId));

/**
 * 旅程の日と、日ごとの立ち寄り (地点付き)・移動を組み立てる。
 * 呼び出し側で旅程が自分のものか確かめてから呼ぶ (custom_places は念のため user_id でも絞る)
 */
export const findDays = async (
	db: Db,
	userId: UserId,
	tripId: string,
): Promise<Day[]> => {
	const dayRows = await db
		.select({ date: days.date, id: days.id, memo: days.memo })
		.from(days)
		.where(eq(days.tripId, tripId))
		.orderBy(asc(days.date));
	const stopRows = await stopsOf(db, userId, tripId);
	const legRows = await legsOf(db, tripId);
	const legByFrom = new Map(
		legRows.map(({ fromStopId, ...leg }) => [fromStopId, leg]),
	);

	const toStop = (r: StopRow): Stop => ({
		approachMemo: r.approachMemo,
		arriveTime: r.arriveTime,
		departTime: r.departTime,
		id: r.id,
		leg: legByFrom.get(r.id) ?? null,
		memo: r.memo,
		place: {
			collectionId: r.collectionId,
			id: r.placeId,
			kind: r.kind,
			lat: r.lat,
			lng: r.lng,
			name: r.name,
			type: r.type,
		},
	});
	return dayRows.map((day) => ({
		...day,
		stops: stopRows.filter((s) => s.dayId === day.id).map(toStop),
	}));
};
