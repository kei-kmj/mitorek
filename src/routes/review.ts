import { Hono } from "hono";
import type { Env } from "../env";
import { route } from "../lib/route";
import { confirmReview, listReview } from "../models/review";
import { ReviewConfirmBody, ReviewItem } from "../schemas/review";
import { TripIdParam } from "../schemas/trips";

/** おでかけプランの振り返り。/api/trips の下に付ける */
const reviewApp = new Hono<Env>();

/** GET /api/trips/:id/review — スポットの立ち寄りと、その日の訪問 */
reviewApp.get(
	"/:id/review",
	...route(
		{
			param: TripIdParam,
			response: ReviewItem.array(),
			summary: "振り返り (行ったかの確認)",
			tags: ["trips", "visits"],
		},
		({ db, param, userId }) => listReview(db, userId, param.id),
	),
);

/** POST /api/trips/:id/review — 選んだ立ち寄りを「行った」にする */
reviewApp.post(
	"/:id/review",
	...route(
		{
			body: ReviewConfirmBody,
			param: TripIdParam,
			response: ReviewItem.array(),
			summary: "振り返りを確定する (訪問を記録)",
			tags: ["trips", "visits"],
		},
		({ body, db, param, userId }) =>
			confirmReview(db, userId, { stopIds: body.stopIds, tripId: param.id }),
	),
);

export { reviewApp };
