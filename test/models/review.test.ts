import { beforeEach, describe, expect, it } from "vitest";
import { visits } from "../../src/db/schema/visits";
import { confirmReview, listReview } from "../../src/models/review";
import { findSpot } from "../../src/models/spots";
import type { TripDetail } from "../../src/schemas/trips";
import { ME, seedFixture } from "../fixtures";
import { addStops, newTrip, othersTrip, testDb } from "../trip-helpers";

let trip: TripDetail;

beforeEach(async () => {
	await seedFixture();
	// 10/10 に 駅 → 姫路城 → ホテル。振り返りに出るのはスポット (姫路城) だけ
	trip = await addStops(await newTrip(), [
		{ id: "himeji", type: "station" },
		{ id: "castle", type: "spot" },
		{ id: "hotel", type: "custom" },
	]);
});

const review = () => listReview(testDb(), ME, trip.id);
const confirm = (stopIds: string[]) =>
	confirmReview(testDb(), ME, { stopIds, tripId: trip.id });
/** 地図の「行った」で、UTC 10/09 16:00 (= 日本時間 10/10 01:00) に記録した訪問 */
const insertLateNightVisit = () =>
	testDb().insert(visits).values({
		id: "late-night",
		spotId: "castle",
		userId: ME,
		visitedAt: "2026-10-09T16:00:00.000Z",
	});
const castleStopId = async () => (await review())[0]?.stopId ?? "";

/** 他人の旅程と無い旅程。どちらも 404 (存在を漏らさない) */
const notMine = [
	["他人の旅程", async () => (await othersTrip()).id],
	["無い旅程", () => Promise.resolve("missing")],
] as const;

describe("listReview", () => {
	it("スポットの立ち寄りだけを、日付と未記録の状態で並べる", async () => {
		expect(
			(await review()).map((i) => [i.name, i.date, i.visits.length]),
		).toEqual([["姫路城", "2026-10-10", 0]]);
	});

	it("地図の「行った」(UTC の日時) は日本時間の日付で数える", async () => {
		await insertLateNightVisit();
		expect((await review())[0]?.visits.map((v) => v.id)).toEqual([
			"late-night",
		]);
	});

	it.each(notMine)("%s は 404", async (_, tripId) => {
		await expect(
			listReview(testDb(), ME, await tripId()),
		).rejects.toMatchObject({ status: 404 });
	});
});

describe("confirmReview", () => {
	it("確定すると、立ち寄りの日付 (日付だけ) の訪問になる", async () => {
		const after = await confirm([await castleStopId()]);
		expect(after[0]?.visits.map((v) => v.visitedAt)).toEqual(["2026-10-10"]);
	});

	it("確定したスポットは訪問済みになる", async () => {
		await confirm([await castleStopId()]);
		expect((await findSpot(testDb(), ME, "castle"))?.visited).toBe(true);
	});

	it("2 回確定しても訪問は 1 つ", async () => {
		const stopId = await castleStopId();
		await confirm([stopId]);
		expect((await confirm([stopId]))[0]?.visits).toHaveLength(1);
	});

	it("その日に地図で記録済みなら、確定しても増やさない", async () => {
		await insertLateNightVisit();
		expect((await confirm([await castleStopId()]))[0]?.visits).toHaveLength(1);
	});

	it.each(notMine)("%s は 404", async (_, tripId) => {
		await expect(
			confirmReview(testDb(), ME, { stopIds: [], tripId: await tripId() }),
		).rejects.toMatchObject({ status: 404 });
	});
});
