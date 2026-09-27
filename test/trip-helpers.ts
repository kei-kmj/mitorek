import { env } from "cloudflare:workers";
import { expect } from "vitest";
import { createDb } from "../src/db/client";
import app from "../src/index";
import { addStop } from "../src/models/stops";
import { createTrip } from "../src/models/trips";
import type { StopCreateBody, TripDetail } from "../src/schemas/trips";
import { ME, OTHER } from "./fixtures";

/**
 * テストで共用する呼び出し。
 * 準備 (旅程・立ち寄りを作る) はモデル関数で行い、API を叩くのは確かめたいリクエストだけにする
 */

export const testDb = () => createDb(env.mitorek_db);

/** /api 以下を JSON で呼ぶ。本文は unknown で返すので、スキーマで確かめてから使う */
export const call = async (method: string, path: string, body?: unknown) => {
	const init: RequestInit = {
		headers: { "content-type": "application/json" },
		method,
	};
	if (body !== undefined) {
		init.body = JSON.stringify(body);
	}
	const res = await app.request(`/api${path}`, init, env);
	return { json: (await res.json()) as unknown, status: res.status };
};

/** 2026-10-10 〜 12 の 3 日間の自分の旅程 */
export const newTrip = () =>
	createTrip(testDb(), ME, {
		endDate: "2026-10-12",
		startDate: "2026-10-10",
		title: "姫路",
	});

export const names = (trip: TripDetail, dayIndex = 0) =>
	trip.days[dayIndex]?.stops.map((s) => s.place.name);

/** 1 日目に地点を順に足し、最新の旅程を返す (updatedAt を引き継ぐので逐次) */
export const addStops = (
	trip: TripDetail,
	places: StopCreateBody["place"][],
): Promise<TripDetail> =>
	places.reduce(async (previous, place) => {
		const current = await previous;
		return addStop(testDb(), ME, {
			body: { place, updatedAt: current.updatedAt },
			dayId: trip.days[0]?.id ?? "",
			tripId: trip.id,
		});
	}, Promise.resolve(trip));

/** 他人の旅程 (1 日だけ) */
export const othersTrip = () =>
	createTrip(testDb(), OTHER, {
		endDate: "2026-10-10",
		startDate: "2026-10-10",
		title: "他人",
	});

/** エラーの応答は { error: { code, message } } で、code は状態コードと同じ */
export const errorBody = (status: number) => ({
	error: { code: status, message: expect.any(String) },
});
