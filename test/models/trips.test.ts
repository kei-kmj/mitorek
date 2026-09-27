import { beforeEach, describe, expect, it } from "vitest";
import { addStop } from "../../src/models/stops";
import {
	createTrip,
	deleteTrip,
	findTripDetail,
	listTrips,
	updateTrip,
} from "../../src/models/trips";
import type { TripDetail } from "../../src/schemas/trips";
import { ME, seedFixture } from "../fixtures";
import { addStops, names, newTrip, othersTrip, testDb } from "../trip-helpers";

const REMOVED_DATE = /2026-10-12/;

beforeEach(seedFixture);

const update = (trip: TripDetail, body: Record<string, unknown>) =>
	updateTrip(testDb(), ME, {
		body: { updatedAt: trip.updatedAt, ...body },
		tripId: trip.id,
	});

/** 3 日目 (10/12) に地点が入った旅程 */
const tripWithLastDayStop = async () => {
	const trip = await newTrip();
	return addStop(testDb(), ME, {
		body: { place: { id: "castle", type: "spot" }, updatedAt: trip.updatedAt },
		dayId: trip.days[2]?.id ?? "",
		tripId: trip.id,
	});
};

describe("createTrip", () => {
	it("期間の日が自動でできる", async () => {
		expect((await newTrip()).days.map((d) => d.date)).toEqual([
			"2026-10-10",
			"2026-10-11",
			"2026-10-12",
		]);
	});

	it("状態を送らなければ計画中 (planning)", async () => {
		expect((await newTrip()).status).toBe("planning");
	});

	it("延期なら日付なしで作れて、日はできない", async () => {
		const trip = await createTrip(testDb(), ME, {
			status: "postponed",
			title: "いつか",
		});
		expect(trip.days).toEqual([]);
	});
});

describe("listTrips", () => {
	it("他人の旅程は出ない", async () => {
		await othersTrip();
		expect(await listTrips(testDb(), ME)).toEqual([]);
	});
});

describe("findTripDetail", () => {
	it("他人の旅程は引けない", async () => {
		const others = await othersTrip();
		expect(await findTripDetail(testDb(), ME, others.id)).toBeUndefined();
	});
});

describe("updateTrip: 期間から外れる日", () => {
	it("地点が入った日が外れるときは、確認なしなら 409 で日付を知らせる", async () => {
		const trip = await tripWithLastDayStop();
		await expect(update(trip, { endDate: "2026-10-11" })).rejects.toMatchObject(
			{ message: expect.stringMatching(REMOVED_DATE), status: 409 },
		);
	});

	it("確認 (removeDaysWithStops) 付きなら、地点ごと日を消す", async () => {
		const trip = await update(await tripWithLastDayStop(), {
			endDate: "2026-10-11",
			removeDaysWithStops: true,
		});
		expect(trip.days.map((d) => d.date)).toEqual(["2026-10-10", "2026-10-11"]);
	});
});

describe("updateTrip: ずらす・延ばす", () => {
	it.each([
		// 日付が重なる区間があっても動かせる
		["1 日", "2026-10-11", "2026-10-13"],
		["別の月へ大きく", "2026-11-01", "2026-11-03"],
	])(
		"日数を変えずに%sずらすと、日ごと中身も動く",
		async (_, startDate, endDate) => {
			const before = await addStops(await newTrip(), [
				{ id: "castle", type: "spot" },
			]);
			const trip = await update(before, { endDate, startDate });
			expect(trip.days[0]?.date).toBe(startDate);
			expect(trip.days).toHaveLength(3);
			// 1 日目は 1 日目のまま
			expect(names(trip, 0)).toEqual(["姫路城"]);
		},
	);

	it("期間を延ばすと日が増え、既存の日と中身は残る", async () => {
		const before = await addStops(await newTrip(), [
			{ id: "castle", type: "spot" },
		]);
		const trip = await update(before, { endDate: "2026-10-13" });
		expect(trip.days).toHaveLength(4);
		expect(names(trip)).toEqual(["姫路城"]);
	});
});

describe("deleteTrip", () => {
	it("消すと一覧から消える", async () => {
		const trip = await newTrip();
		await deleteTrip(testDb(), ME, {
			tripId: trip.id,
			updatedAt: trip.updatedAt,
		});
		expect(await listTrips(testDb(), ME)).toEqual([]);
	});

	it("古い updatedAt は 409", async () => {
		const trip = await newTrip();
		await expect(
			deleteTrip(testDb(), ME, { tripId: trip.id, updatedAt: "old" }),
		).rejects.toMatchObject({ status: 409 });
	});

	it("他人の旅程は updatedAt が合っていても 404", async () => {
		const others = await othersTrip();
		await expect(
			deleteTrip(testDb(), ME, {
				tripId: others.id,
				updatedAt: others.updatedAt,
			}),
		).rejects.toMatchObject({ status: 404 });
	});
});
