import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { route } from "../lib/route"
import { Spot, NearbySpot, SpotListQuery, NearbyQuery, SpotIdParam } from "../schemas/spots"
import { listSpots, findNearbyUnvisited, findSpot } from "../models/spots"
import type { Env } from "../env"

const app = new Hono<Env>()

/** GET /api/spots — 一覧。矩形・コレクション・県・未訪問で絞る */
app.get("/", ...route(
  { tags: ["spots"], summary: "スポット一覧", query: SpotListQuery, response: Spot.array() },
  ({ query, db, userId }) => listSpots(db, userId, query),
))

/** GET /api/spots/nearby — 中心と半径から未訪問スポットを距離順に。取りこぼしチェックと共用 */
app.get("/nearby", ...route(
  { tags: ["spots"], summary: "近傍の未訪問スポット", query: NearbyQuery, response: NearbySpot.array() },
  ({ query: { center, radiusM }, db, userId }) => findNearbyUnvisited(db, userId, center, radiusM),
))

/** GET /api/spots/:id */
app.get("/:id", ...route(
  { tags: ["spots"], summary: "スポット詳細", param: SpotIdParam, response: Spot },
  async ({ param, db, userId }) => {
    const spot = await findSpot(db, userId, param.id)
    if (!spot) throw new HTTPException(404, { message: "spot not found" })
    return spot
  },
))

export default app
