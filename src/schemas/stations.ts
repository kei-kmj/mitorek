import { type } from "arktype";
import { BoundingBox, Latitude, Longitude } from "./geo";

/** 一度に返す範囲の上限 (度)。都心でズーム 11 相当の表示範囲が収まる程度 */
const MAX_SPAN_DEG = 1;

// ---- 出力 ----
export const StationLine = type({
	name: "string",
	/** 事業者名。取り込み元に無ければ null */
	operator: "string | null",
});
export type StationLine = typeof StationLine.infer;

export const Station = type({
	id: "string",
	lat: Latitude,
	lines: StationLine.array(),
	lng: Longitude,
	name: "string",
});
export type Station = typeof Station.infer;

// ---- 入力 ----
/** GET /api/stations : 表示範囲の駅。全国一括は重いので矩形を必須にし、広さも制限する */
export const StationListQuery = type({
	bbox: BoundingBox.narrow(
		(b, ctx) =>
			(b.east - b.west <= MAX_SPAN_DEG && b.north - b.south <= MAX_SPAN_DEG) ||
			ctx.mustBe(`at most ${MAX_SPAN_DEG} degree wide and tall`),
	),
});
export type StationListQuery = typeof StationListQuery.infer;
