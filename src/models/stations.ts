import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
	lines,
	railOperators,
	stationLines,
	stations,
} from "../db/schema/rail";
import { withinBbox } from "../lib/geo-sql";
import type { BoundingBox } from "../schemas/geo";
import type { Station } from "../schemas/stations";

/**
 * 矩形内の駅と、その駅を通る路線。駅は共有マスタなので userId を取らない。
 * 路線は JSON 配列にまとめて 1 クエリで返す (駅ごとに引き直さない)
 */
export const listStationsIn = (db: Db, bbox: BoundingBox): Promise<Station[]> =>
	db
		.select({
			id: stations.id,
			lat: stations.lat,
			lines: sql<Station["lines"]>`json_group_array(json_object(
        'name', ${lines.name}, 'operator', ${railOperators.name}))`.mapWith(
				(v: string) => JSON.parse(v),
			),
			lng: stations.lng,
			name: stations.name,
		})
		.from(stations)
		.innerJoin(stationLines, eq(stationLines.stationId, stations.id))
		.innerJoin(lines, eq(lines.id, stationLines.lineId))
		.leftJoin(railOperators, eq(railOperators.id, lines.operatorId))
		.where(withinBbox(bbox, stations.lat, stations.lng))
		.groupBy(stations.id)
		.orderBy(asc(stations.name));
