import { type } from "arktype";

const BBOX_PARTS = 4;

/**
 * 地理の値オブジェクト。範囲チェックは型に持たせ、ハンドラやモデルには検証済みの値しか渡さない。
 */
export const Latitude = type("-90 <= number <= 90");
export const Longitude = type("-180 <= number <= 180");

export const GeoPoint = type({ lat: Latitude, lng: Longitude });
export type GeoPoint = typeof GeoPoint.infer;

/** 近傍検索の半径 (m)。既定と上限をここで決め、マジックナンバーを散らさない */
export const DEFAULT_RADIUS_M = 2000;
export const MAX_RADIUS_M = 20_000;
export const RadiusM = type(`1 <= number <= ${MAX_RADIUS_M}`);

/** "west,south,east,north" の文字列 → 矩形。解析と検証をここで完結させる */
export const BoundingBox = type("string").pipe((s, ctx) => {
	const parts = s.split(",").map(Number);
	if (parts.length !== BBOX_PARTS || parts.some((n) => !Number.isFinite(n))) {
		return ctx.error("4 numbers west,south,east,north");
	}
	const [west, south, east, north] = parts as [number, number, number, number];
	if (south > north || west > east) {
		return ctx.error("ordered so that south<=north and west<=east");
	}
	return { east, north, south, west };
});
export type BoundingBox = typeof BoundingBox.infer;
