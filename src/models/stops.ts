import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { ulid } from "ulidx";
import type { Db } from "../db/client";
import { legs, stops } from "../db/schema/itinerary";
import type { UserId } from "../env";
import { BAD_REQUEST } from "../lib/http";
import type {
	LegBody,
	StopCreateBody,
	StopOrderBody,
	StopUpdateBody,
	TripDetail,
} from "../schemas/trips";
import { assertPlace, dayStopIds, findStopDay } from "./stop-lookup";
import { runLocked } from "./trip-lock";
import { getTripDetail } from "./trips";

/** 並べ替えの途中で UNIQUE(day_id, seq) にぶつからないよう、一度この分だけ逃がす */
const SEQ_SHIFT = 100_000;

/** その日の stop を、UNIQUE(day_id, seq) にぶつからない位置まで一度逃がす */
const shiftDay = (db: Db, dayId: string) =>
	db
		.update(stops)
		.set({ seq: sql`${stops.seq} + ${SEQ_SHIFT}` })
		.where(eq(stops.dayId, dayId));

/** 逃がした後で、order の順に 0, 1, 2 … と振り直す */
const assignSeq = (db: Db, order: string[]) =>
	order.map((id, i) =>
		db.update(stops).set({ seq: i }).where(eq(stops.id, id)),
	);

/** 並びが変わって隣り合わなくなった移動を消す (手入力の URL やメモもここで消える) */
const dropStaleLegs = (db: Db, order: string[]) => {
	if (order.length === 0) {
		return [];
	}
	// 隣り合う組 "from>to" の一覧。stop が 1 つなら組は無く、NOT IN は常に真になる
	const pairs = order.slice(1).map((to, i) => `${order[i]}>${to}`);
	return [
		db
			.delete(legs)
			.where(
				and(
					inArray(legs.fromStopId, order),
					notInArray(sql`${legs.fromStopId} || '>' || ${legs.toStopId}`, pairs),
				),
			),
	];
};

// ---- 追加: index の位置に差し込む (省略時は末尾) ----
export const addStop = async (
	db: Db,
	userId: UserId,
	{
		body,
		dayId,
		tripId,
	}: { body: StopCreateBody; dayId: string; tripId: string },
): Promise<TripDetail> => {
	const order = await dayStopIds(db, userId, tripId, dayId);
	await assertPlace(db, userId, body.place);
	const lock = { tripId, updatedAt: body.updatedAt, userId };
	const id = ulid();
	const index = Math.min(body.index ?? order.length, order.length);
	const next = order.toSpliced(index, 0, id);
	// spot_id / station_id / custom_place_id のうち、種類に合う列にだけ id を入れる
	const target = (type: typeof body.place.type) =>
		(body.place.type === type && body.place.id) || null;
	await runLocked(db, lock, [
		shiftDay(db, dayId),
		db.insert(stops).values({
			customPlaceId: target("custom"),
			dayId,
			id,
			seq: index,
			spotId: target("spot"),
			stationId: target("station"),
		}),
		...assignSeq(db, next),
		...dropStaleLegs(db, next),
	]);
	return getTripDetail(db, userId, tripId);
};

// ---- 時刻・メモの変更。送られた項目だけ ----
export const updateStop = async (
	db: Db,
	userId: UserId,
	{
		body,
		stopId,
		tripId,
	}: { body: StopUpdateBody; stopId: string; tripId: string },
): Promise<TripDetail> => {
	await findStopDay(db, userId, tripId, stopId);
	const columns = [
		"approachMemo",
		"arriveTime",
		"departTime",
		"memo",
	] as const satisfies Exclude<keyof StopUpdateBody, "updatedAt">[];
	// 送られた項目だけ。null を送ったら空にする
	const sets = Object.fromEntries(
		columns.filter((k) => k in body).map((k) => [k, body[k] ?? null]),
	);
	if (Object.keys(sets).length > 0) {
		const lock = { tripId, updatedAt: body.updatedAt, userId };
		await runLocked(db, lock, [
			db.update(stops).set(sets).where(eq(stops.id, stopId)),
		]);
	}
	return getTripDetail(db, userId, tripId);
};

// ---- 削除: 残りを詰め直し、前後の移動も整える ----
export const deleteStop = async (
	db: Db,
	userId: UserId,
	{
		stopId,
		tripId,
		updatedAt,
	}: { stopId: string; tripId: string; updatedAt: string },
): Promise<TripDetail> => {
	const dayId = await findStopDay(db, userId, tripId, stopId);
	const rest = (await dayStopIds(db, userId, tripId, dayId)).filter(
		(id) => id !== stopId,
	);
	const lock = { tripId, updatedAt, userId };
	await runLocked(db, lock, [
		db.delete(stops).where(eq(stops.id, stopId)),
		shiftDay(db, dayId),
		...assignSeq(db, rest),
		...dropStaleLegs(db, rest),
	]);
	return getTripDetail(db, userId, tripId);
};

// ---- 並べ替え: その日の stop を全部、新しい順で受け取る ----
export const reorderStops = async (
	db: Db,
	userId: UserId,
	{
		body,
		dayId,
		tripId,
	}: { body: StopOrderBody; dayId: string; tripId: string },
): Promise<TripDetail> => {
	const order = await dayStopIds(db, userId, tripId, dayId);
	const same =
		body.stopIds.length === order.length &&
		new Set(body.stopIds).size === order.length &&
		body.stopIds.every((id) => order.includes(id));
	if (!same) {
		throw new HTTPException(BAD_REQUEST, {
			message: "stopIds must list every stop of the day exactly once",
		});
	}
	const lock = { tripId, updatedAt: body.updatedAt, userId };
	await runLocked(db, lock, [
		shiftDay(db, dayId),
		...assignSeq(db, body.stopIds),
		...dropStaleLegs(db, body.stopIds),
	]);
	return getTripDetail(db, userId, tripId);
};

// ---- 移動: stop から同じ日の次の stop へ。PUT なので送られなかった項目は空になる ----
export const putLeg = async (
	db: Db,
	userId: UserId,
	{ body, stopId, tripId }: { body: LegBody; stopId: string; tripId: string },
): Promise<TripDetail> => {
	const dayId = await findStopDay(db, userId, tripId, stopId);
	const order = await dayStopIds(db, userId, tripId, dayId);
	const to = order[order.indexOf(stopId) + 1];
	if (!to) {
		throw new HTTPException(BAD_REQUEST, {
			message: "その日の最後の地点には、次への移動がありません",
		});
	}
	const lock = { tripId, updatedAt: body.updatedAt, userId };
	const leg = {
		arriveTime: body.arriveTime ?? null,
		departTime: body.departTime ?? null,
		memo: body.memo ?? null,
		mode: body.mode,
		toStopId: to,
		url: body.url ?? null,
		urlGenerated: false,
	};
	await runLocked(db, lock, [
		db
			.insert(legs)
			.values({ ...leg, fromStopId: stopId, id: ulid() })
			.onConflictDoUpdate({ set: leg, target: legs.fromStopId }),
	]);
	return getTripDetail(db, userId, tripId);
};

export const deleteLeg = async (
	db: Db,
	userId: UserId,
	{
		stopId,
		tripId,
		updatedAt,
	}: { stopId: string; tripId: string; updatedAt: string },
): Promise<TripDetail> => {
	await findStopDay(db, userId, tripId, stopId);
	const lock = { tripId, updatedAt, userId };
	await runLocked(db, lock, [
		db.delete(legs).where(eq(legs.fromStopId, stopId)),
	]);
	return getTripDetail(db, userId, tripId);
};
