import { Hono } from "hono";
import type { Env } from "../env";
import { route } from "../lib/route";
import { listStationsIn } from "../models/stations";
import { Station, StationListQuery } from "../schemas/stations";

const stationsApp = new Hono<Env>();

/** GET /api/stations?bbox= — 表示範囲の駅と路線。地図の駅表示に使う */
stationsApp.get(
	"/",
	...route(
		{
			query: StationListQuery,
			response: Station.array(),
			summary: "矩形内の駅 (路線付き)",
			tags: ["stations"],
		},
		({ query, db }) => listStationsIn(db, query.bbox),
	),
);

export { stationsApp };
