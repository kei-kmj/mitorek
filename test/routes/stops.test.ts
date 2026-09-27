import { beforeEach, describe, expect, it } from "vitest";
import { TripDetail } from "../../src/schemas/trips";
import { seedFixture } from "../fixtures";
import { addStops, call, errorBody, newTrip } from "../trip-helpers";

beforeEach(seedFixture);

/** 1 日目に 駅 → 姫路城 の旅程 */
const tripWithStops = async () => {
	const trip = await addStops(await newTrip(), [
		{ id: "himeji", type: "station" },
		{ id: "castle", type: "spot" },
	]);
	const [first, last] = trip.days[0]?.stops.map((s) => s.id) ?? [];
	return { dayId: trip.days[0]?.id, first, last, trip };
};

describe("POST /api/trips/:id/days/:dayId/stops", () => {
	const post = async (
		body: { place: { id: string; type: string }; updatedAt?: string },
		dayOf: (trip: TripDetail) => string | undefined = (t) => t.days[0]?.id,
	) => {
		const trip = await newTrip();
		return call("POST", `/trips/${trip.id}/days/${dayOf(trip)}/stops`, {
			updatedAt: trip.updatedAt,
			...body,
		});
	};

	it("201 で更新後の旅程を返す", async () => {
		const { json, status } = await post({
			place: { id: "castle", type: "spot" },
		});
		expect(status).toBe(201);
		expect(TripDetail.allows(json)).toBe(true);
	});

	it("地点の種類が不正なら 400", async () => {
		const { status } = await post({ place: { id: "castle", type: "shop" } });
		expect(status).toBe(400);
	});

	it.each([
		["他人の登録地点", { id: "others", type: "custom" }, undefined],
		["無い日", { id: "castle", type: "spot" }, () => "missing"],
	])("%s は 404", async (_, place, dayOf) => {
		const { json, status } = await post({ place }, dayOf);
		expect(status).toBe(404);
		expect(json).toEqual(errorBody(404));
	});

	it("古い updatedAt は 409", async () => {
		const { status } = await post({
			place: { id: "castle", type: "spot" },
			updatedAt: "old",
		});
		expect(status).toBe(409);
	});
});

describe("PUT /api/trips/:id/days/:dayId/order", () => {
	it("200 で並べ替えた旅程を返す", async () => {
		const { dayId, first, last, trip } = await tripWithStops();
		const { json, status } = await call(
			"PUT",
			`/trips/${trip.id}/days/${dayId}/order`,
			{ stopIds: [last, first], updatedAt: trip.updatedAt },
		);
		expect(status).toBe(200);
		expect(TripDetail.allows(json)).toBe(true);
	});

	it("その日の stop が過不足なく無ければ 400", async () => {
		const { dayId, first, trip } = await tripWithStops();
		const { status } = await call(
			"PUT",
			`/trips/${trip.id}/days/${dayId}/order`,
			{ stopIds: [first], updatedAt: trip.updatedAt },
		);
		expect(status).toBe(400);
	});
});

describe("PATCH /api/trips/:id/stops/:stopId", () => {
	it("200 で変更後の旅程を返す", async () => {
		const { first, trip } = await tripWithStops();
		const { json, status } = await call(
			"PATCH",
			`/trips/${trip.id}/stops/${first}`,
			{ arriveTime: "10:30", updatedAt: trip.updatedAt },
		);
		expect(status).toBe(200);
		expect(TripDetail.allows(json)).toBe(true);
	});

	it.each([["10時半"], ["25:00"], ["9:00"]])(
		"時刻が HH:MM でない (%s) なら 400",
		async (arriveTime) => {
			const { first, trip } = await tripWithStops();
			const { status } = await call(
				"PATCH",
				`/trips/${trip.id}/stops/${first}`,
				{
					arriveTime,
					updatedAt: trip.updatedAt,
				},
			);
			expect(status).toBe(400);
		},
	);

	it("無い stop は 404", async () => {
		const { trip } = await tripWithStops();
		const { status } = await call("PATCH", `/trips/${trip.id}/stops/missing`, {
			memo: "x",
			updatedAt: trip.updatedAt,
		});
		expect(status).toBe(404);
	});
});

describe("DELETE /api/trips/:id/stops/:stopId", () => {
	it("200 で消した後の旅程を返す", async () => {
		const { first, trip } = await tripWithStops();
		const { json, status } = await call(
			"DELETE",
			`/trips/${trip.id}/stops/${first}?updatedAt=${trip.updatedAt}`,
		);
		expect(status).toBe(200);
		expect(TripDetail.allows(json)).toBe(true);
	});

	it("updatedAt なしは 400", async () => {
		const { first, trip } = await tripWithStops();
		const { status } = await call("DELETE", `/trips/${trip.id}/stops/${first}`);
		expect(status).toBe(400);
	});
});

describe("PUT /api/trips/:id/stops/:stopId/leg", () => {
	it("200 で移動の入った旅程を返す", async () => {
		const { first, trip } = await tripWithStops();
		const { json, status } = await call(
			"PUT",
			`/trips/${trip.id}/stops/${first}/leg`,
			{ mode: "walk", updatedAt: trip.updatedAt },
		);
		expect(status).toBe(200);
		expect(TripDetail.allows(json)).toBe(true);
	});

	it("手段が不正なら 400", async () => {
		const { first, trip } = await tripWithStops();
		const { status } = await call(
			"PUT",
			`/trips/${trip.id}/stops/${first}/leg`,
			{ mode: "rocket", updatedAt: trip.updatedAt },
		);
		expect(status).toBe(400);
	});

	it("最後の stop には移動が無いので 400", async () => {
		const { last, trip } = await tripWithStops();
		const { json, status } = await call(
			"PUT",
			`/trips/${trip.id}/stops/${last}/leg`,
			{ mode: "walk", updatedAt: trip.updatedAt },
		);
		expect(status).toBe(400);
		expect(json).toEqual(errorBody(400));
	});
});

describe("DELETE /api/trips/:id/stops/:stopId/leg", () => {
	it("200 で移動を消した旅程を返す", async () => {
		const { first, trip } = await tripWithStops();
		const { json, status } = await call(
			"DELETE",
			`/trips/${trip.id}/stops/${first}/leg?updatedAt=${trip.updatedAt}`,
		);
		expect(status).toBe(200);
		expect(TripDetail.allows(json)).toBe(true);
	});
});
