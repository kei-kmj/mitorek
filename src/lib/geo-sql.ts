import { type SQL, sql } from "drizzle-orm";
import type { BoundingBox, GeoPoint } from "../schemas/geo";
import { EARTH_RADIUS_M } from "./geo";

/**
 * 近傍検索・最寄り駅・取りこぼしチェックで同じ式を使うため、ここに 1 つだけ置く。
 * 返すのは道のりでなく大円距離 (m)
 */
export const haversineM = (center: GeoPoint, latCol: SQL, lngCol: SQL): SQL =>
	sql`
  ${EARTH_RADIUS_M} * 2 * asin(sqrt(
    pow(sin(radians(${latCol} - ${center.lat}) / 2), 2) +
    cos(radians(${center.lat})) * cos(radians(${latCol})) *
    pow(sin(radians(${lngCol} - ${center.lng}) / 2), 2)))`;

/** Haversine の前に矩形で粗く絞る。索引が効く形にするため別の式にしている */
export const withinBbox = (b: BoundingBox, latCol: SQL, lngCol: SQL): SQL =>
	sql`${latCol} BETWEEN ${b.south} AND ${b.north} AND ${lngCol} BETWEEN ${b.west} AND ${b.east}`;
