import { and, asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Db } from "../db/client";
import { customPlaces, days, stops, trips } from "../db/schema/itinerary";
import { spots } from "../db/schema/master";
import { stations } from "../db/schema/rail";
import type { UserId } from "../env";
import { NOT_FOUND } from "../lib/http";
import type { StopCreateBody } from "../schemas/trips";

/** 立ち寄りの変更の前に引くもの。どれも自分の旅程に無ければ 404 */

const notFound = (what: string) =>
	new HTTPException(NOT_FOUND, { message: `${what} not found` });

/** 自分の旅程のその日の stop を、今の順で */
export const dayStopIds = async (
	db: Db,
	userId: UserId,
	tripId: string,
	dayId: string,
): Promise<string[]> => {
	const day = await db
		.select({ id: days.id })
		.from(days)
		.innerJoin(trips, eq(trips.id, days.tripId))
		.where(
			and(
				eq(days.id, dayId),
				eq(days.tripId, tripId),
				eq(trips.userId, userId),
			),
		)
		.get();
	if (!day) {
		throw notFound("day");
	}
	const rows = await db
		.select({ id: stops.id })
		.from(stops)
		.where(eq(stops.dayId, dayId))
		.orderBy(asc(stops.seq));
	return rows.map((r) => r.id);
};

export const findStopDay = async (
	db: Db,
	userId: UserId,
	tripId: string,
	stopId: string,
): Promise<string> => {
	const row = await db
		.select({ dayId: stops.dayId })
		.from(stops)
		.innerJoin(days, eq(days.id, stops.dayId))
		.innerJoin(trips, eq(trips.id, days.tripId))
		.where(
			and(
				eq(stops.id, stopId),
				eq(days.tripId, tripId),
				eq(trips.userId, userId),
			),
		)
		.get();
	if (!row) {
		throw notFound("stop");
	}
	return row.dayId;
};

/** 立ち寄り先が存在するか。custom は自分の登録地点だけ */
export const assertPlace = async (
	db: Db,
	userId: UserId,
	place: StopCreateBody["place"],
): Promise<void> => {
	const query: Record<
		typeof place.type,
		() => Promise<{ id: string } | undefined>
	> = {
		custom: () =>
			db
				.select({ id: customPlaces.id })
				.from(customPlaces)
				.where(
					and(eq(customPlaces.id, place.id), eq(customPlaces.userId, userId)),
				)
				.get(),
		spot: () =>
			db
				.select({ id: spots.id })
				.from(spots)
				.where(eq(spots.id, place.id))
				.get(),
		station: () =>
			db
				.select({ id: stations.id })
				.from(stations)
				.where(eq(stations.id, place.id))
				.get(),
	};
	if (!(await query[place.type]())) {
		throw notFound("place");
	}
};
