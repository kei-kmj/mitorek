import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import type { UserId } from "../env";
import type { Day, Leg, Place, Stop } from "../schemas/trips";

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

/**
 * 旅程の日と、日ごとの立ち寄り (地点付き)・移動を組み立てる。
 * 呼び出し側で旅程が自分のものか確かめてから呼ぶ (custom_places は念のため user_id でも絞る)
 */
export const findDays = async (
	db: Db,
	userId: UserId,
	tripId: string,
): Promise<Day[]> => {
	const days = await db.all<Omit<Day, "stops">>(
		sql`SELECT id, date, memo FROM days WHERE trip_id = ${tripId} ORDER BY date`,
	);
	const stops = await db.all<StopRow>(sql`
    SELECT st.id, st.day_id AS dayId, st.arrive_time AS arriveTime, st.depart_time AS departTime,
      st.approach_memo AS approachMemo, st.memo,
      CASE WHEN st.spot_id IS NOT NULL THEN 'spot'
           WHEN st.station_id IS NOT NULL THEN 'station' ELSE 'custom' END AS type,
      COALESCE(st.spot_id, st.station_id, st.custom_place_id) AS placeId,
      COALESCE(sp.name, sn.name, cp.name) AS name,
      COALESCE(sp.lat, sn.lat, cp.lat) AS lat,
      COALESCE(sp.lng, sn.lng, cp.lng) AS lng,
      sp.collection_id AS collectionId, cp.kind
    FROM stops st
    JOIN days d ON d.id = st.day_id
    LEFT JOIN spots sp ON sp.id = st.spot_id
    LEFT JOIN stations sn ON sn.id = st.station_id
    LEFT JOIN custom_places cp ON cp.id = st.custom_place_id AND cp.user_id = ${userId}
    WHERE d.trip_id = ${tripId}
    ORDER BY st.seq`);
	const legs = await db.all<Leg & { fromStopId: string }>(sql`
    SELECT l.id, l.from_stop_id AS fromStopId, l.mode, l.depart_time AS departTime,
      l.arrive_time AS arriveTime, l.url, l.memo
    FROM legs l JOIN stops st ON st.id = l.from_stop_id JOIN days d ON d.id = st.day_id
    WHERE d.trip_id = ${tripId}`);
	const legByFrom = new Map(
		legs.map(({ fromStopId, ...leg }) => [fromStopId, leg]),
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
	return days.map((day) => ({
		...day,
		stops: stops.filter((s) => s.dayId === day.id).map(toStop),
	}));
};
