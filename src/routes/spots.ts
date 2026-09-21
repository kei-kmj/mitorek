import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { NOT_FOUND } from "../lib/http";
import { route } from "../lib/route";
import { findNearbyUnvisited, findSpot, listSpots } from "../models/spots";
import {
	NearbyQuery,
	NearbySpot,
	Spot,
	SpotIdParam,
	SpotListQuery,
} from "../schemas/spots";

const spotsApp = new Hono<Env>();

/** GET /api/spots — 一覧。矩形・コレクション・県・未訪問で絞る */
spotsApp.get(
	"/",
	...route(
		{
			query: SpotListQuery,
			response: Spot.array(),
			summary: "スポット一覧",
			tags: ["spots"],
		},
		({ query, db, userId }) => listSpots(db, userId, query),
	),
);

/** GET /api/spots/nearby — 中心と半径から未訪問スポットを距離順に。取りこぼしチェックと共用 */
spotsApp.get(
	"/nearby",
	...route(
		{
			query: NearbyQuery,
			response: NearbySpot.array(),
			summary: "近傍の未訪問スポット (直線距離)",
			tags: ["spots"],
		},
		({ query: { center, radiusM }, db, userId }) =>
			findNearbyUnvisited(db, userId, center, radiusM),
	),
);

/** GET /api/spots/:id */
spotsApp.get(
	"/:id",
	...route(
		{
			param: SpotIdParam,
			response: Spot,
			summary: "スポット詳細",
			tags: ["spots"],
		},
		async ({ param, db, userId }) => {
			const spot = await findSpot(db, userId, param.id);
			if (!spot) {
				throw new HTTPException(NOT_FOUND, { message: "spot not found" });
			}
			return spot;
		},
	),
);

export { spotsApp };
