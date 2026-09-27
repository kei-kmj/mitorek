import { beforeEach, describe, expect, it } from "vitest";
import { ReviewItem } from "../../src/schemas/review";
import type { TripDetail } from "../../src/schemas/trips";
import { seedFixture } from "../fixtures";
import {
	addStops,
	call,
	errorBody,
	newTrip,
	othersTrip,
} from "../trip-helpers";

/** 他人の旅程と無い旅程。どちらも 404 (存在を漏らさない) */
const notMine = [
	["他人の旅程", async () => (await othersTrip()).id],
	["無い旅程", () => Promise.resolve("missing")],
] as const;

let trip: TripDetail;

beforeEach(async () => {
	await seedFixture();
	trip = await addStops(await newTrip(), [{ id: "castle", type: "spot" }]);
});

describe("GET /api/trips/:id/review", () => {
	it("200 で振り返りの一覧を返す", async () => {
		const { json, status } = await call("GET", `/trips/${trip.id}/review`);
		expect(status).toBe(200);
		expect(ReviewItem.array().allows(json)).toBe(true);
	});

	it.each(notMine)("%s は 404", async (_, tripId) => {
		const { json, status } = await call(
			"GET",
			`/trips/${await tripId()}/review`,
		);
		expect(status).toBe(404);
		expect(json).toEqual(errorBody(404));
	});
});

describe("POST /api/trips/:id/review", () => {
	it("200 で確定後の一覧を返す", async () => {
		const { json, status } = await call("POST", `/trips/${trip.id}/review`, {
			stopIds: [trip.days[0]?.stops[0]?.id],
		});
		expect(status).toBe(200);
		expect(ReviewItem.array().allows(json)).toBe(true);
	});

	it.each([
		["stopIds なし", {}],
		["stopIds が配列でない", { stopIds: "x" }],
	])("%s は 400", async (_, body) => {
		expect((await call("POST", `/trips/${trip.id}/review`, body)).status).toBe(
			400,
		);
	});

	it.each(notMine)("%s は 404", async (_, tripId) => {
		const { status } = await call("POST", `/trips/${await tripId()}/review`, {
			stopIds: [],
		});
		expect(status).toBe(404);
	});
});
