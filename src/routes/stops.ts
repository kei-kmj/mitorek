import { Hono } from "hono";
import type { Env } from "../env";
import { CREATED } from "../lib/http";
import { route } from "../lib/route";
import {
	addStop,
	deleteLeg,
	deleteStop,
	putLeg,
	reorderStops,
	updateStop,
} from "../models/stops";
import {
	DayParam,
	LegBody,
	StopCreateBody,
	StopOrderBody,
	StopParam,
	StopUpdateBody,
	TripDetail,
	UpdatedAtQuery,
} from "../schemas/trips";

/**
 * 旅程の中の立ち寄り (stop) と移動 (leg)。/api/trips の下に付ける。
 * 変更はすべて旅程の updatedAt で楽観ロックし、更新後の旅程全体を返す
 */
const stopsApp = new Hono<Env>();

/** POST /api/trips/:id/days/:dayId/stops — 地点を足す (index 省略で末尾) */
stopsApp.post(
	"/:id/days/:dayId/stops",
	...route(
		{
			body: StopCreateBody,
			param: DayParam,
			response: TripDetail,
			status: CREATED,
			summary: "立ち寄りを足す",
			tags: ["trips"],
		},
		({ body, db, param, userId }) =>
			addStop(db, userId, { body, dayId: param.dayId, tripId: param.id }),
	),
);

/** PUT /api/trips/:id/days/:dayId/order — その日の並びを丸ごと指定する */
stopsApp.put(
	"/:id/days/:dayId/order",
	...route(
		{
			body: StopOrderBody,
			param: DayParam,
			response: TripDetail,
			summary: "立ち寄りを並べ替える",
			tags: ["trips"],
		},
		({ body, db, param, userId }) =>
			reorderStops(db, userId, { body, dayId: param.dayId, tripId: param.id }),
	),
);

/** PATCH /api/trips/:id/stops/:stopId — 時刻・メモ */
stopsApp.patch(
	"/:id/stops/:stopId",
	...route(
		{
			body: StopUpdateBody,
			param: StopParam,
			response: TripDetail,
			summary: "立ち寄りの時刻・メモを変える",
			tags: ["trips"],
		},
		({ body, db, param, userId }) =>
			updateStop(db, userId, { body, stopId: param.stopId, tripId: param.id }),
	),
);

/** DELETE /api/trips/:id/stops/:stopId?updatedAt= */
stopsApp.delete(
	"/:id/stops/:stopId",
	...route(
		{
			param: StopParam,
			query: UpdatedAtQuery,
			response: TripDetail,
			summary: "立ち寄りを消す",
			tags: ["trips"],
		},
		({ db, param, query, userId }) =>
			deleteStop(db, userId, {
				stopId: param.stopId,
				tripId: param.id,
				updatedAt: query.updatedAt,
			}),
	),
);

/** PUT /api/trips/:id/stops/:stopId/leg — 次の立ち寄りへの移動 */
stopsApp.put(
	"/:id/stops/:stopId/leg",
	...route(
		{
			body: LegBody,
			param: StopParam,
			response: TripDetail,
			summary: "移動を入れる",
			tags: ["trips"],
		},
		({ body, db, param, userId }) =>
			putLeg(db, userId, { body, stopId: param.stopId, tripId: param.id }),
	),
);

/** DELETE /api/trips/:id/stops/:stopId/leg?updatedAt= */
stopsApp.delete(
	"/:id/stops/:stopId/leg",
	...route(
		{
			param: StopParam,
			query: UpdatedAtQuery,
			response: TripDetail,
			summary: "移動を消す",
			tags: ["trips"],
		},
		({ db, param, query, userId }) =>
			deleteLeg(db, userId, {
				stopId: param.stopId,
				tripId: param.id,
				updatedAt: query.updatedAt,
			}),
	),
);

export { stopsApp };
