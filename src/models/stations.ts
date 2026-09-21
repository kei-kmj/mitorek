import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { withinBbox } from "../lib/geo-sql";
import type { BoundingBox } from "../schemas/geo";
import type { Station } from "../schemas/stations";

type Row = Omit<Station, "lines"> & { lines: string };

/**
 * 矩形内の駅と、その駅を通る路線。駅は共有マスタなので userId を取らない。
 * 路線は JSON 配列にまとめて 1 クエリで返す (駅ごとに引き直さない)
 */
export const listStationsIn = async (
	db: Db,
	bbox: BoundingBox,
): Promise<Station[]> => {
	const rows = await db.all<Row>(sql`
    SELECT st.id, st.name, st.lat, st.lng,
      json_group_array(json_object('name', l.name, 'operator', o.name)) AS lines
    FROM stations st
    JOIN station_lines sl ON sl.station_id = st.id
    JOIN lines l ON l.id = sl.line_id
    LEFT JOIN rail_operators o ON o.id = l.operator_id
    WHERE ${withinBbox(bbox, sql`st.lat`, sql`st.lng`)}
    GROUP BY st.id
    ORDER BY st.name`);
	return rows.map((r) => ({ ...r, lines: JSON.parse(r.lines) }));
};
