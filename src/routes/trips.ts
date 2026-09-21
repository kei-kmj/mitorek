import { type } from "arktype";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { CREATED, NOT_FOUND } from "../lib/http";
import { route } from "../lib/route";
import {
	createTrip,
	deleteTrip,
	findTripDetail,
	listTrips,
	updateTrip,
} from "../models/trips";
import {
	TripCreateBody,
	TripDetail,
	TripIdParam,
	TripSummary,
	TripUpdateBody,
	UpdatedAtQuery,
} from "../schemas/trips";

const tripsApp = new Hono<Env>();

/** GET /api/trips — 自分の旅程 (日付の新しい順、日の一覧付き) */
tripsApp.get(
	"/",
	...route(
		{ response: TripSummary.array(), summary: "旅程一覧", tags: ["trips"] },
		({ db, userId }) => listTrips(db, userId),
	),
);

/** POST /api/trips — 期間の日も一緒に作る */
tripsApp.post(
	"/",
	...route(
		{
			body: TripCreateBody,
			response: TripDetail,
			status: CREATED,
			summary: "旅程を作る",
			tags: ["trips"],
		},
		({ body, db, userId }) => createTrip(db, userId, body),
	),
);

/** GET /api/trips/:id — 日・立ち寄り・移動まで全部 */
tripsApp.get(
	"/:id",
	...route(
		{
			param: TripIdParam,
			response: TripDetail,
			summary: "旅程の詳細",
			tags: ["trips"],
		},
		async ({ db, param, userId }) => {
			const trip = await findTripDetail(db, userId, param.id);
			if (!trip) {
				throw new HTTPException(NOT_FOUND, { message: "trip not found" });
			}
			return trip;
		},
	),
);

/** PATCH /api/trips/:id — 送った項目だけ変える。期間が変わると日も増減する */
tripsApp.patch(
	"/:id",
	...route(
		{
			body: TripUpdateBody,
			param: TripIdParam,
			response: TripDetail,
			summary: "旅程を変える",
			tags: ["trips"],
		},
		({ body, db, param, userId }) =>
			updateTrip(db, userId, { body, tripId: param.id }),
	),
);

/** DELETE /api/trips/:id?updatedAt= */
tripsApp.delete(
	"/:id",
	...route(
		{
			param: TripIdParam,
			query: UpdatedAtQuery,
			response: type({ id: "string" }),
			summary: "旅程を消す",
			tags: ["trips"],
		},
		({ db, param, query, userId }) =>
			deleteTrip(db, userId, { tripId: param.id, updatedAt: query.updatedAt }),
	),
);

export { tripsApp };
