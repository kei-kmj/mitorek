import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { HTTPException } from "hono/http-exception";
import { ulid } from "ulidx";
import type { Db } from "../db/client";
import { days, stops, trips } from "../db/schema/itinerary";
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
import { assertOwnTrip, runLocked, STALE_MESSAGE } from "./trip-lock";

type TripRow = Omit<TripDetail, "days">;

const tripColumns = {
	endDate: trips.endDate,
	id: trips.id,
	memo: trips.memo,
	startDate: trips.startDate,
	status: trips.status,
	title: trips.title,
	updatedAt: trips.updatedAt,
};

const findTripRow = (
	db: Db,
	userId: UserId,
	tripId: string,
): Promise<TripRow | undefined> =>
	db
		.select(tripColumns)
		.from(trips)
		.where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
		.get();

/** 期間に合わせて日を作る文 (旅程の作成・期間の変更で共用) */
const insertDays = (db: Db, tripId: string, dates: string[]) =>
	dates.map((date) => db.insert(days).values({ date, id: ulid(), tripId }));

/** 期間の変更で外れる日。地点が入った日は確認なしには消さない */
const daysOutside = async (db: Db, tripId: string, dates: string[]) => {
	const rows = await db
		.select({ date: days.date, id: days.id, stops: count(stops.id) })
		.from(days)
		.leftJoin(stops, eq(stops.dayId, days.id))
		.where(eq(days.tripId, tripId))
		.groupBy(days.id);
	const keep = new Set(dates);
	return {
		existing: new Set(rows.map((d) => d.date)),
		removed: rows.filter((d) => !keep.has(d.date)),
	};
};

/**
 * 旅程をずらした (日数は同じまま開始日が変わった) ときは、日ごと動かす。1 日目は 1 日目のまま中身も付いていく。
 * UNIQUE(trip_id, date) に途中でぶつからないよう、一度仮の値にしてから新しい日付を入れる
 */
const shiftDays = (db: Db, current: { id: string }[], dates: string[]) => {
	const setDate = (id: string, date: string) =>
		db.update(days).set({ date }).where(eq(days.id, id));
	return [
		...current.map((d) => setDate(d.id, `shift:${d.id}`)),
		...current.map((d, i) => setDate(d.id, dates[i] as string)),
	];
};

/**
 * 期間の変更で日を合わせる文。
 * - 日数が同じで開始日が変わった (旅程をずらした): 日ごと動かす
 * - 日数が変わった (延ばした・縮めた): 端で日を足し引きする。地点の入った日が外れるときは確認 (409) を求める
 */
const periodStatements = async (
	db: Db,
	{
		current,
		dates,
		removeDaysWithStops,
	}: {
		current: TripRow;
		dates: string[];
		removeDaysWithStops: boolean;
	},
): Promise<BatchItem<"sqlite">[]> => {
	const currentDays = await db
		.select({ date: days.date, id: days.id })
		.from(days)
		.where(eq(days.tripId, current.id))
		.orderBy(asc(days.date));
	const moved = current.startDate !== dates[0];
	if (moved && currentDays.length === dates.length) {
		return shiftDays(db, currentDays, dates);
	}
	const { existing, removed } = await daysOutside(db, current.id, dates);
	const withStops = removed.filter((d) => d.stops > 0);
	if (withStops.length > 0 && !removeDaysWithStops) {
		throw new HTTPException(CONFLICT, {
			message: `地点が入っている日が期間から外れます: ${withStops.map((d) => d.date).join(", ")}`,
		});
	}
	return [
		...insertDays(
			db,
			current.id,
			dates.filter((d) => !existing.has(d)),
		),
		...removed.map((d) => db.delete(days).where(eq(days.id, d.id))),
	];
};

// ---- 一覧 (地図の「旅程に追加」で日を選ぶので、日も付ける) ----
export const listTrips = async (
	db: Db,
	userId: UserId,
): Promise<TripSummary[]> => {
	const rows = await db
		.select({
			endDate: trips.endDate,
			id: trips.id,
			startDate: trips.startDate,
			status: trips.status,
			title: trips.title,
			updatedAt: trips.updatedAt,
		})
		.from(trips)
		.where(eq(trips.userId, userId))
		.orderBy(
			sql`${trips.startDate} IS NULL`,
			desc(trips.startDate),
			desc(trips.createdAt),
		);
	const dayRows = await db
		.select({ date: days.date, id: days.id, tripId: days.tripId })
		.from(days)
		.innerJoin(trips, eq(trips.id, days.tripId))
		.where(eq(trips.userId, userId))
		.orderBy(asc(days.date));
	return rows.map((t) => ({
		...t,
		days: dayRows
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
	await db.batch([
		db.insert(trips).values({
			endDate: body.endDate ?? null,
			id,
			memo: body.memo ?? null,
			startDate: body.startDate ?? null,
			status: body.status ?? "planning",
			title: body.title,
			userId,
		}),
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
	const statements: BatchItem<"sqlite">[] = [
		db
			.update(trips)
			.set({
				endDate: next.endDate,
				memo: next.memo,
				startDate: next.startDate,
				status: next.status,
				title: next.title,
			})
			.where(eq(trips.id, tripId)),
	];
	// 延期などで日付が無いときは、日はそのまま残す
	if (next.startDate && next.endDate) {
		statements.push(
			...(await periodStatements(db, {
				current,
				dates: datesBetween(next.startDate, next.endDate),
				removeDaysWithStops: body.removeDaysWithStops ?? false,
			})),
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
	const result = await db
		.delete(trips)
		.where(
			and(
				eq(trips.id, tripId),
				eq(trips.userId, userId),
				eq(trips.updatedAt, updatedAt),
			),
		);
	if (result.meta.changes > 0) {
		return { id: tripId };
	}
	// 消えなかった: 旅程が無い (404) のか、updatedAt が古い (409) のか
	await assertOwnTrip(db, userId, tripId);
	throw new HTTPException(CONFLICT, { message: STALE_MESSAGE });
};
