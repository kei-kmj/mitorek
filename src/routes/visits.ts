import { type } from "arktype";
import { Hono } from "hono";
import type { Env } from "../env";
import { CREATED } from "../lib/http";
import { route } from "../lib/route";
import { createVisit, deleteVisit, listVisits } from "../models/visits";
import {
	Visit,
	VisitCreateBody,
	VisitIdParam,
	VisitListQuery,
} from "../schemas/visits";

const visitsApp = new Hono<Env>();

/** GET /api/visits?spotId= — そのスポットへの自分の訪問 */
visitsApp.get(
	"/",
	...route(
		{
			query: VisitListQuery,
			response: Visit.array(),
			summary: "スポットへの訪問の一覧",
			tags: ["visits"],
		},
		({ db, query, userId }) => listVisits(db, userId, query.spotId),
	),
);

/** POST /api/visits — いま行った (地図の「行った」) */
visitsApp.post(
	"/",
	...route(
		{
			body: VisitCreateBody,
			response: Visit,
			status: CREATED,
			summary: "訪問を記録する",
			tags: ["visits"],
		},
		({ body, db, userId }) => createVisit(db, userId, body),
	),
);

/** DELETE /api/visits/:id — 間違えた訪問を取り消す */
visitsApp.delete(
	"/:id",
	...route(
		{
			param: VisitIdParam,
			response: type({ id: "string" }),
			summary: "訪問を取り消す",
			tags: ["visits"],
		},
		({ c, db, param, userId }) =>
			deleteVisit(db, userId, {
				bucket: c.env.mitorek_images,
				visitId: param.id,
			}),
	),
);

export { visitsApp };
