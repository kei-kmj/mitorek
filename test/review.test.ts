import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { visits } from "../src/db/schema/visits";
import type { ReviewItem } from "../src/schemas/review";
import type { TripDetail } from "../src/schemas/trips";
import { addStops, call, ME, newTrip, seedTripFixture } from "./trip-helpers";

let trip: TripDetail;

beforeEach(async () => {
	await seedTripFixture();
	// 10/10 に 駅 → 姫路城 → ホテル。振り返りに出るのはスポット (姫路城) だけ
	trip = await addStops(await newTrip(), [
		{ id: "himeji", type: "station" },
		{ id: "castle", type: "spot" },
		{ id: "hotel", type: "custom" },
	]);
});

const review = async () =>
	(await call("GET", `/trips/${trip.id}/review`))
		.json as unknown as ReviewItem[];

const confirm = async (stopIds: string[]) =>
	(await call("POST", `/trips/${trip.id}/review`, { stopIds }))
		.json as unknown as ReviewItem[];

describe("振り返り", () => {
	it("スポットの立ち寄りだけが並び、確定するとその日の訪問になる", async () => {
		const before = await review();
		expect(before.map((i) => [i.name, i.date, i.visits.length])).toEqual([
			["姫路城", "2026-10-10", 0],
		]);
		const after = await confirm([before[0]?.stopId ?? ""]);
		expect(after[0]?.visits.map((v) => v.visitedAt)).toEqual(["2026-10-10"]);
		const spot = (await call("GET", "/spots/castle")).json as unknown as {
			visited: boolean;
		};
		expect(spot.visited).toBe(true);
	});

	it("2 回確定しても訪問は 1 つ", async () => {
		const [item] = await review();
		await confirm([item?.stopId ?? ""]);
		const again = await confirm([item?.stopId ?? ""]);
		expect(again[0]?.visits).toHaveLength(1);
	});

	it("地図の「行った」(UTC の日時) は日本時間の日付で数える", async () => {
		// UTC 10/09 16:00 = 日本時間 10/10 01:00
		await createDb(env.mitorek_db).insert(visits).values({
			id: "late-night",
			spotId: "castle",
			userId: ME,
			visitedAt: "2026-10-09T16:00:00.000Z",
		});
		const [item] = await review();
		expect(item?.visits.map((v) => v.id)).toEqual(["late-night"]);
		// 記録済みなので確定しても増えない
		expect((await confirm([item?.stopId ?? ""]))[0]?.visits).toHaveLength(1);
	});

	it("他人のおでかけプランは 404", async () => {
		expect((await call("GET", "/trips/missing/review")).status).toBe(404);
	});
});
