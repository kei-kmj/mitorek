import { type SQL, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { ulid } from "ulidx";
import type { Db } from "../db/client";
import type { UserId } from "../env";
import { BAD_REQUEST, NOT_FOUND } from "../lib/http";
import type {
	LegBody,
	StopCreateBody,
	StopOrderBody,
	StopUpdateBody,
	TripDetail,
} from "../schemas/trips";
import { guard, type Lock, runLocked, stmt } from "./trip-lock";
import { getTripDetail } from "./trips";

/** 並べ替えの途中で UNIQUE(day_id, seq) にぶつからないよう、一度この分だけ逃がす */
const SEQ_SHIFT = 100_000;

const notFound = (what: string) =>
	new HTTPException(NOT_FOUND, { message: `${what} not found` });

/** 自分の旅程のその日の stop を、今の順で */
const dayStopIds = async (
	db: Db,
	userId: UserId,
	tripId: string,
	dayId: string,
): Promise<string[]> => {
	const day = await db.get<{ id: string }>(sql`
    SELECT d.id FROM days d JOIN trips t ON t.id = d.trip_id
    WHERE d.id = ${dayId} AND d.trip_id = ${tripId} AND t.user_id = ${userId}`);
	if (!day) {
		throw notFound("day");
	}
	const rows = await db.all<{ id: string }>(
		sql`SELECT id FROM stops WHERE day_id = ${dayId} ORDER BY seq`,
	);
	return rows.map((r) => r.id);
};

const findStopDay = async (
	db: Db,
	userId: UserId,
	tripId: string,
	stopId: string,
): Promise<string> => {
	const row = await db.get<{ dayId: string }>(sql`
    SELECT st.day_id AS dayId FROM stops st
    JOIN days d ON d.id = st.day_id JOIN trips t ON t.id = d.trip_id
    WHERE st.id = ${stopId} AND d.trip_id = ${tripId} AND t.user_id = ${userId}`);
	if (!row) {
		throw notFound("stop");
	}
	return row.dayId;
};

/** 立ち寄り先が存在するか。custom は自分の登録地点だけ */
const assertPlace = async (
	db: Db,
	userId: UserId,
	place: StopCreateBody["place"],
): Promise<void> => {
	const query: Record<typeof place.type, SQL> = {
		custom: sql`SELECT id FROM custom_places WHERE id = ${place.id} AND user_id = ${userId}`,
		spot: sql`SELECT id FROM spots WHERE id = ${place.id}`,
		station: sql`SELECT id FROM stations WHERE id = ${place.id}`,
	};
	if (!(await db.get(query[place.type]))) {
		throw notFound("place");
	}
};

/** その日の stop を、UNIQUE(day_id, seq) にぶつからない位置まで一度逃がす */
const shiftDay = (db: Db, dayId: string, lock: Lock): D1PreparedStatement =>
	stmt(
		db,
		sql`UPDATE stops SET seq = seq + ${SEQ_SHIFT} WHERE day_id = ${dayId} AND ${guard(lock)}`,
	);

/** 逃がした後で、order の順に 0, 1, 2 … と振り直す */
const assignSeq = (
	db: Db,
	order: string[],
	lock: Lock,
): D1PreparedStatement[] =>
	order.map((id, i) =>
		stmt(
			db,
			sql`UPDATE stops SET seq = ${i} WHERE id = ${id} AND ${guard(lock)}`,
		),
	);

/** 並びが変わって隣り合わなくなった移動を消す (手入力の URL やメモもここで消える) */
const dropStaleLegs = (
	db: Db,
	order: string[],
	lock: Lock,
): D1PreparedStatement[] => {
	if (order.length === 0) {
		return [];
	}
	// 隣り合う組 "from>to" の一覧。stop が 1 つなら組は無く、'' だけを置いて NOT IN を成り立たせる
	const pairs = order.slice(1).map((to, i) => sql`${`${order[i]}>${to}`}`);
	pairs.push(sql`''`);
	return [
		stmt(
			db,
			sql`
      DELETE FROM legs
      WHERE from_stop_id IN (${sql.join(
				order.map((id) => sql`${id}`),
				sql`, `,
			)})
        AND (from_stop_id || '>' || to_stop_id) NOT IN (${sql.join(pairs, sql`, `)})
        AND ${guard(lock)}`,
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
		shiftDay(db, dayId, lock),
		stmt(
			db,
			sql`
      INSERT INTO stops (id, day_id, seq, spot_id, station_id, custom_place_id)
      SELECT ${id}, ${dayId}, ${index}, ${target("spot")}, ${target("station")}, ${target("custom")}
      WHERE ${guard(lock)}`,
		),
		...assignSeq(db, next, lock),
		...dropStaleLegs(db, next, lock),
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
	const columns: Record<Exclude<keyof StopUpdateBody, "updatedAt">, SQL> = {
		approachMemo: sql`approach_memo`,
		arriveTime: sql`arrive_time`,
		departTime: sql`depart_time`,
		memo: sql`memo`,
	};
	const sets = (Object.keys(columns) as (keyof typeof columns)[])
		.filter((k) => k in body)
		.map((k) => sql`${columns[k]} = ${body[k] ?? null}`);
	if (sets.length > 0) {
		const lock = { tripId, updatedAt: body.updatedAt, userId };
		await runLocked(db, lock, [
			stmt(
				db,
				sql`UPDATE stops SET ${sql.join(sets, sql`, `)} WHERE id = ${stopId} AND ${guard(lock)}`,
			),
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
		stmt(db, sql`DELETE FROM stops WHERE id = ${stopId} AND ${guard(lock)}`),
		shiftDay(db, dayId, lock),
		...assignSeq(db, rest, lock),
		...dropStaleLegs(db, rest, lock),
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
		shiftDay(db, dayId, lock),
		...assignSeq(db, body.stopIds, lock),
		...dropStaleLegs(db, body.stopIds, lock),
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
	await runLocked(db, lock, [
		stmt(
			db,
			sql`
      INSERT INTO legs (id, from_stop_id, to_stop_id, mode, depart_time, arrive_time, url, url_generated, memo)
      SELECT ${ulid()}, ${stopId}, ${to}, ${body.mode}, ${body.departTime ?? null},
        ${body.arriveTime ?? null}, ${body.url ?? null}, 0, ${body.memo ?? null}
      WHERE ${guard(lock)}
      ON CONFLICT (from_stop_id) DO UPDATE SET
        to_stop_id = excluded.to_stop_id, mode = excluded.mode,
        depart_time = excluded.depart_time, arrive_time = excluded.arrive_time,
        url = excluded.url, url_generated = 0, memo = excluded.memo`,
		),
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
		stmt(
			db,
			sql`DELETE FROM legs WHERE from_stop_id = ${stopId} AND ${guard(lock)}`,
		),
	]);
	return getTripDetail(db, userId, tripId);
};
