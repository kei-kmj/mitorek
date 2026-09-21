import { env } from "cloudflare:test";
import { createDb } from "../src/db/client";
import { customPlaces } from "../src/db/schema/itinerary";
import {
	collections,
	games,
	prefectures,
	regions,
	spots,
} from "../src/db/schema/master";
import { stations } from "../src/db/schema/rail";
import { users } from "../src/db/schema/users";
import app from "../src/index";
import type { TripDetail } from "../src/schemas/trips";

/** 旅程まわりのテスト (trips / stops) で共用する準備データと API 呼び出し */

type Json = TripDetail & { error?: { message: string } };

export const ME = env.DEV_USER_ID;
export const OTHER = "01OTHERUSER0000000000000000";

/** 自分と他人、スポット 1 (姫路城)・駅 1 (姫路)・自分のホテルと他人の場所 */
export const seedTripFixture = async () => {
	const db = createDb(env.mitorek_db);
	await db.batch([
		db.insert(users).values([
			{ email: "me@example.com", id: ME },
			{ email: "other@example.com", id: OTHER },
		]),
		db.insert(games).values({ id: "dqw", name: "DQW" }),
		db.insert(regions).values({ id: "kinki", name: "近畿" }),
		db.insert(prefectures).values({
			code: "JP-28",
			countryCode: "JP",
			name: "兵庫県",
			regionId: "kinki",
			sortOrder: 28,
		}),
		db
			.insert(collections)
			.values({ gameId: "dqw", id: "dqw.castle", name: "城" }),
		db.insert(spots).values({
			collectionId: "dqw.castle",
			id: "castle",
			lat: 34.8394,
			lng: 134.6939,
			name: "姫路城",
		}),
		db.insert(stations).values({
			id: "himeji",
			lat: 34.827,
			lng: 134.69,
			name: "姫路",
			prefectureCode: "JP-28",
			source: "test",
			sourceCode: "1",
		}),
		db.insert(customPlaces).values([
			{
				id: "hotel",
				kind: "hotel",
				lat: 34.83,
				lng: 134.69,
				name: "駅前ホテル",
				userId: ME,
			},
			{ id: "others", lat: 35, lng: 135, name: "他人の場所", userId: OTHER },
		]),
	]);
};

/** /api 以下を JSON で呼ぶ */
export const call = async (method: string, path: string, body?: unknown) => {
	const init: RequestInit = {
		headers: { "content-type": "application/json" },
		method,
	};
	if (body !== undefined) {
		init.body = JSON.stringify(body);
	}
	const res = await app.request(`/api${path}`, init, env);
	return { json: (await res.json()) as Json, status: res.status };
};

/** 2026-10-10 〜 12 の 3 日間の旅程 */
export const newTrip = async () =>
	(
		await call("POST", "/trips", {
			endDate: "2026-10-12",
			startDate: "2026-10-10",
			title: "姫路",
		})
	).json;

export const names = (trip: TripDetail, dayIndex = 0) =>
	trip.days[dayIndex]?.stops.map((s) => s.place.name);

/** 1 日目に地点を順に足し、最新の旅程を返す (updatedAt を引き継ぐので逐次) */
export const addStops = (
	trip: TripDetail,
	places: { id: string; type: string }[],
): Promise<TripDetail> =>
	places.reduce(async (previous, place) => {
		const current = await previous;
		return (
			await call("POST", `/trips/${trip.id}/days/${trip.days[0]?.id}/stops`, {
				place,
				updatedAt: current.updatedAt,
			})
		).json;
	}, Promise.resolve(trip));
