import { sql, type SQL } from "drizzle-orm"
import type { GeoPoint } from "../schemas/geo"

/**
 * 行の (latCol, lngCol) と center の直線距離 (m) を返す Haversine の SQL 式。
 * 近傍検索・最寄り駅・取りこぼしチェックで同じ式を使う。
 */
export const haversineM = (center: GeoPoint, latCol: SQL, lngCol: SQL): SQL => sql`
  6371000 * 2 * asin(sqrt(
    pow(sin(radians(${latCol} - ${center.lat}) / 2), 2) +
    cos(radians(${center.lat})) * cos(radians(${latCol})) *
    pow(sin(radians(${lngCol} - ${center.lng}) / 2), 2)))`

/** 中心と半径(m)で行を粗く絞る矩形条件 */
export const withinBbox = (b: { south: number; north: number; west: number; east: number }, latCol: SQL, lngCol: SQL): SQL =>
  sql`${latCol} BETWEEN ${b.south} AND ${b.north} AND ${lngCol} BETWEEN ${b.west} AND ${b.east}`
