import { sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { ulid } from "ulidx";
import type { Db } from "../db/client";
import type { UserId } from "../env";
import { datesBetween, periodProblem } from "../lib/dates";
import { BAD_REQUEST, CONFLICT, NOT_FOUND } from "../lib/http";
import {
	MAX_TRIP_DAYS,
	type TripCreateBody,
	type TripDetail,
	type TripSummary,
	type TripUpdateBody,
} from "../schemas/trips";
import { findDays } from "./trip-detail";
import {
	assertOwnTrip,
	guard,
	runLocked,
	STALE_MESSAGE,
	stmt,
} from "./trip-lock";

type TripRow = Omit<TripDetail, "days">;

const tripColumns = sql`id, title, start_date AS startDate, end_date AS endDate,
  status, memo, updated_at AS updatedAt`;

const findTripRow = (
	db: Db,
	userId: UserId,
	tripId: string,
): Promise<TripRow | undefined> =>
	db.get<TripRow>(
		sql`SELECT ${tripColumns} FROM trips WHERE id = ${tripId} AND user_id = ${userId}`,
	);

/** 期間に合わせて日を作る文 (旅程の作成・期間の変更で共用) */
const insertDays = (
	db: Db,
	tripId: string,
	dates: string[],
	condition = sql`1 = 1`,
): D1PreparedStatement[] =>
	dates.map((date) =>
		stmt(
			db,
			sql`INSERT INTO days (id, trip_id, date) SELECT ${ulid()}, ${tripId}, ${date} WHERE ${condition}`,
		),
	);

/** 期間の変更で外れる日。地点が入った日は確認なしには消さない */
const daysOutside = async (db: Db, tripId: string, dates: string[]) => {
	const days = await db.all<{ date: string; id: string; stops: number }>(sql`
    SELECT d.id, d.date, (SELECT count(*) FROM stops s WHERE s.day_id = d.id) AS stops
    FROM days d WHERE d.trip_id = ${tripId}`);
	const keep = new Set(dates);
	return {
		existing: new Set(days.map((d) => d.date)),
		removed: days.filter((d) => !keep.has(d.date)),
	};
};

// ---- 一覧 (地図の「旅程に追加」で日を選ぶので、日も付ける) ----
export const listTrips = async (
	db: Db,
	userId: UserId,
): Promise<TripSummary[]> => {
	const trips = await db.all<Omit<TripSummary, "days">>(sql`
    SELECT id, title, start_date AS startDate, end_date AS endDate, status, updated_at AS updatedAt
    FROM trips WHERE user_id = ${userId}
    ORDER BY start_date IS NULL, start_date DESC, created_at DESC`);
	const days = await db.all<{ date: string; id: string; tripId: string }>(sql`
    SELECT d.id, d.trip_id AS tripId, d.date FROM days d
    JOIN trips t ON t.id = d.trip_id WHERE t.user_id = ${userId} ORDER BY d.date`);
	return trips.map((t) => ({
		...t,
		days: days
			.filter((d) => d.tripId === t.id)
			.map(({ date, id }) => ({ date, id })),
	}));
};

// ---- 詳細 ----
export const findTripDetail = async (
	db: Db,
	userId: UserId,
	tripId: string,
): Promise<TripDetail | undefined> => {
	const trip = await findTripRow(db, userId, tripId);
	if (!trip) {
		return;
	}
	return { ...trip, days: await findDays(db, userId, tripId) };
};

export const getTripDetail = async (
	db: Db,
	userId: UserId,
	tripId: string,
): Promise<TripDetail> => {
	const trip = await findTripDetail(db, userId, tripId);
	if (!trip) {
		throw new HTTPException(NOT_FOUND, { message: "trip not found" });
	}
	return trip;
};

// ---- 作成: 期間の日も一緒に作る ----
export const createTrip = async (
	db: Db,
	userId: UserId,
	body: TripCreateBody,
): Promise<TripDetail> => {
	const id = ulid();
	// 延期中 (日付なし) の旅程は日を作らない
	const dates: string[] = [];
	if (body.startDate && body.endDate) {
		dates.push(...datesBetween(body.startDate, body.endDate));
	}
	await db.$client.batch([
		stmt(
			db,
			sql`
      INSERT INTO trips (id, user_id, title, start_date, end_date, status, memo)
      VALUES (${id}, ${userId}, ${body.title}, ${body.startDate ?? null}, ${body.endDate ?? null},
        ${body.status ?? "planning"}, ${body.memo ?? null})`,
		),
		...insertDays(db, id, dates),
	]);
	return getTripDetail(db, userId, id);
};

// ---- 更新: 送られた項目だけ変える。期間が変わったら日を増減する ----
export const updateTrip = async (
	db: Db,
	userId: UserId,
	{ body, tripId }: { body: TripUpdateBody; tripId: string },
): Promise<TripDetail> => {
	const current = await findTripRow(db, userId, tripId);
	if (!current) {
		throw new HTTPException(NOT_FOUND, { message: "trip not found" });
	}
	const next = { ...current, ...body };
	const problem = periodProblem(next, MAX_TRIP_DAYS);
	if (problem) {
		throw new HTTPException(BAD_REQUEST, { message: problem });
	}
	const lock = { tripId, updatedAt: body.updatedAt, userId };
	const statements: D1PreparedStatement[] = [
		stmt(
			db,
			sql`
      UPDATE trips SET title = ${next.title}, start_date = ${next.startDate}, end_date = ${next.endDate},
        status = ${next.status}, memo = ${next.memo}
      WHERE id = ${tripId} AND ${guard(lock)}`,
		),
	];
	// 延期などで日付が無いときは、日はそのまま残す
	if (next.startDate && next.endDate) {
		const dates = datesBetween(next.startDate, next.endDate);
		const { existing, removed } = await daysOutside(db, tripId, dates);
		const withStops = removed.filter((d) => d.stops > 0);
		if (withStops.length > 0 && !body.removeDaysWithStops) {
			throw new HTTPException(CONFLICT, {
				message: `地点が入っている日が期間から外れます: ${withStops.map((d) => d.date).join(", ")}`,
			});
		}
		statements.push(
			...insertDays(
				db,
				tripId,
				dates.filter((d) => !existing.has(d)),
				guard(lock),
			),
			...removed.map((d) =>
				stmt(db, sql`DELETE FROM days WHERE id = ${d.id} AND ${guard(lock)}`),
			),
		);
	}
	await runLocked(db, lock, statements);
	return getTripDetail(db, userId, tripId);
};

// ---- 削除: 日・立ち寄り・移動・リンクは外部キーの cascade で消える ----
export const deleteTrip = async (
	db: Db,
	userId: UserId,
	{ tripId, updatedAt }: { tripId: string; updatedAt: string },
): Promise<{ id: string }> => {
	const result = await db.run(sql`
    DELETE FROM trips WHERE id = ${tripId} AND user_id = ${userId} AND updated_at = ${updatedAt}`);
	if (result.meta.changes > 0) {
		return { id: tripId };
	}
	// 消えなかった: 旅程が無い (404) のか、updatedAt が古い (409) のか
	await assertOwnTrip(db, userId, tripId);
	throw new HTTPException(CONFLICT, { message: STALE_MESSAGE });
};
