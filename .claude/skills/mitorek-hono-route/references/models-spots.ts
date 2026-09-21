import { sql, type SQL } from "drizzle-orm"
import type { DrizzleD1Database } from "drizzle-orm/d1"
import type { Spot, NearbySpot, SpotListQuery } from "../schemas/spots"
import type { GeoPoint } from "../schemas/geo"
import { bboxAround } from "../lib/geo"
import { haversineM, withinBbox } from "../lib/geo-sql"
import type { UserId } from "../env"

type Db = DrizzleD1Database

// ---- 「訪問済み」の定義はここ 1 か所。列にも条件にも同じ式を使う ----
const visitedBy = (userId: UserId): SQL =>
  sql`EXISTS (SELECT 1 FROM visits v WHERE v.spot_id = s.id AND v.user_id = ${userId})`

const spotColumns = (userId: UserId) => sql`
  s.id, s.collection_id AS collectionId, s.group_key AS groupKey, s.name,
  s.prefecture_code AS prefectureCode, s.lat, s.lng, s.reward, s.official_url AS officialUrl, s.note,
  (s.retired_at IS NOT NULL) AS retired,
  ${visitedBy(userId)} AS visited`

const toSpot = (r: Record<string, unknown>): Spot =>
  ({ ...r, retired: r.retired === 1, visited: r.visited === 1 }) as Spot

// ---- 絞り込み条件 → SQL の対応表。条件を足すときは SpotListQuery に項目を足し、ここに 1 行足す ----
type Filters = { [K in keyof SpotListQuery]-?: (v: NonNullable<SpotListQuery[K]>, userId: UserId) => SQL }
const filters: Filters = {
  bbox:       (b) => withinBbox(b, sql`s.lat`, sql`s.lng`),
  collection: (id) => sql`s.collection_id = ${id}`,
  pref:       (code) => sql`s.prefecture_code = ${code}`,
  unvisited:  (on, userId) => (on ? sql`NOT ${visitedBy(userId)}` : sql`1 = 1`),
}

const conditionsFrom = (q: SpotListQuery, userId: UserId): SQL[] =>
  (Object.keys(filters) as (keyof Filters)[])
    .filter((k) => q[k] !== undefined)
    .map((k) => filters[k](q[k] as never, userId))

// ---- 一覧 ----
export async function listSpots(db: Db, userId: UserId, q: SpotListQuery): Promise<Spot[]> {
  const conditions = [sql`s.retired_at IS NULL`, ...conditionsFrom(q, userId)]
  const rows = await db.all<Record<string, unknown>>(
    sql`SELECT ${spotColumns(userId)} FROM spots s WHERE ${sql.join(conditions, sql` AND `)} ORDER BY s.name`,
  )
  return rows.map(toSpot)
}

// ---- 近傍 (未訪問のみ) ----
export async function findNearbyUnvisited(
  db: Db, userId: UserId, center: GeoPoint, radiusM: number,
): Promise<NearbySpot[]> {
  const rows = await db.all<Record<string, unknown>>(sql`
    SELECT * FROM (
      SELECT ${spotColumns(userId)}, ${haversineM(center, sql`s.lat`, sql`s.lng`)} AS distanceM
      FROM spots s
      WHERE s.retired_at IS NULL
        AND ${withinBbox(bboxAround(center, radiusM), sql`s.lat`, sql`s.lng`)}
        AND NOT ${visitedBy(userId)}
    ) WHERE distanceM <= ${radiusM}
    ORDER BY distanceM`)
  return rows.map(toSpot) as NearbySpot[]
}

// ---- 単体 ----
export async function findSpot(db: Db, userId: UserId, id: string): Promise<Spot | undefined> {
  const row = await db.get<Record<string, unknown>>(
    sql`SELECT ${spotColumns(userId)} FROM spots s WHERE s.id = ${id}`,
  )
  return row ? toSpot(row) : undefined
}
