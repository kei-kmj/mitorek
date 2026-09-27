import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { days, trips } from "../../src/db/schema/itinerary";
import { addStop } from "../../src/models/stops";
import { runLocked } from "../../src/models/trip-lock";
import { findTripDetail, updateTrip } from "../../src/models/trips";
import type { TripDetail } from "../../src/schemas/trips";
import { ME, OTHER, seedFixture } from "../fixtures";
import { newTrip, testDb } from "../trip-helpers";

beforeEach(seedFixture);

const insertDay = (tripId: string) =>
	testDb().insert(days).values({ date: "2026-10-13", id: "day-4", tripId });
const lockOf = (trip: TripDetail, updatedAt = trip.updatedAt) => ({
	tripId: trip.id,
	updatedAt,
	userId: ME,
});
const reload = async (trip: TripDetail) =>
	(await findTripDetail(testDb(), ME, trip.id)) as TripDetail;

describe("runLocked", () => {
	it("updatedAt が合っていれば文を流す", async () => {
		const trip = await newTrip();
		await runLocked(testDb(), lockOf(trip), [insertDay(trip.id)]);
		expect((await reload(trip)).days).toHaveLength(4);
	});

	it("流したら updatedAt を進める", async () => {
		const trip = await newTrip();
		await runLocked(testDb(), lockOf(trip), [insertDay(trip.id)]);
		expect((await reload(trip)).updatedAt).not.toBe(trip.updatedAt);
	});

	it("古い updatedAt は 409", async () => {
		const trip = await newTrip();
		await expect(
			runLocked(testDb(), lockOf(trip, "old"), [insertDay(trip.id)]),
		).rejects.toMatchObject({ status: 409 });
	});

	it("古い updatedAt なら、batch の文は 1 つも残らず updatedAt も変わらない", async () => {
		const trip = await newTrip();
		await runLocked(testDb(), lockOf(trip, "old"), [insertDay(trip.id)]).catch(
			() => undefined,
		);
		const after = await reload(trip);
		expect(after.days).toHaveLength(3);
		expect(after.updatedAt).toBe(trip.updatedAt);
	});

	it("他人の旅程は updatedAt が合っていても 404", async () => {
		const trip = await newTrip();
		await testDb()
			.update(trips)
			.set({ userId: OTHER })
			.where(eq(trips.id, trip.id));
		await expect(
			runLocked(testDb(), lockOf(trip), [insertDay(trip.id)]),
		).rejects.toMatchObject({ status: 404 });
	});
});

describe("先に変更されたときに取り消されるもの", () => {
	/** 誰かが先に題名を変えた旅程と、変える前の (古い) updatedAt */
	const changedByOthers = async () => {
		const trip = await newTrip();
		await updateTrip(testDb(), ME, {
			body: { title: "A", updatedAt: trip.updatedAt },
			tripId: trip.id,
		});
		return trip;
	};

	it.each([
		[
			"題名と期間の変更",
			(trip: TripDetail) =>
				updateTrip(testDb(), ME, {
					body: {
						endDate: "2026-10-14",
						title: "B",
						updatedAt: trip.updatedAt,
					},
					tripId: trip.id,
				}),
		],
		[
			"立ち寄りの追加",
			(trip: TripDetail) =>
				addStop(testDb(), ME, {
					body: {
						place: { id: "castle", type: "spot" },
						updatedAt: trip.updatedAt,
					},
					dayId: trip.days[0]?.id ?? "",
					tripId: trip.id,
				}),
		],
	])("%s は 409 で、何も残らない", async (_, change) => {
		const stale = await changedByOthers();
		await expect(change(stale)).rejects.toMatchObject({ status: 409 });
		const after = await reload(stale);
		expect(after.title).toBe("A");
		expect(after.days).toHaveLength(3);
		expect(after.days.flatMap((d) => d.stops)).toEqual([]);
	});
});
