import type { BoundingBox, GeoPoint } from "../schemas/geo";

const EARTH_RADIUS_M = 6_371_000;
const HALF_TURN_DEG = 180;
const DEG_PER_RAD = HALF_TURN_DEG / Math.PI;

/**
 * 中心から半径 radiusM を必ず含む矩形。Haversine の前段の粗い絞り込み用。
 * 経度方向は緯度が高いほど 1 度が短くなるので cos(lat) で割る。
 */
export const bboxAround = (center: GeoPoint, radiusM: number): BoundingBox => {
	const dLat = (radiusM / EARTH_RADIUS_M) * DEG_PER_RAD;
	const dLng = dLat / Math.cos(center.lat / DEG_PER_RAD);
	return {
		east: center.lng + dLng,
		north: center.lat + dLat,
		south: center.lat - dLat,
		west: center.lng - dLng,
	};
};
