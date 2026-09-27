import { beforeEach, describe, expect, it } from "vitest";
import { TripDetail, TripSummary } from "../../src/schemas/trips";
import { seedFixture } from "../fixtures";
import { call, errorBody, newTrip, othersTrip } from "../trip-helpers";

const MISSING_DATES = /startDate and endDate/;
const STALE = "2000-01-01T00:00:00.000Z";

/** 他人の旅程と無い旅程。どちらも 404 (存在を漏らさない) */
const notMine = [
	["他人の旅程", async () => (await othersTrip()).id],
	["無い旅程", () => Promise.resolve("missing")],
] as const;

beforeEach(seedFixture);

describe("GET /api/trips", () => {
	it("200 で旅程の一覧 (日付き) を返す", async () => {
		const trip = await newTrip();
		const { json, status } = await call("GET", "/trips");
		expect(status).toBe(200);
		expect(TripSummary.array().allows(json)).toBe(true);
		expect(json).toMatchObject([{ id: trip.id }]);
	});

	it("他人の旅程は含めない", async () => {
		await othersTrip();
		expect((await call("GET", "/trips")).json).toEqual([]);
	});
});

describe("POST /api/trips", () => {
	it("201 で作った旅程の詳細を返す", async () => {
		const { json, status } = await call("POST", "/trips", {
			endDate: "2026-10-12",
			startDate: "2026-10-10",
			title: "姫路",
		});
		expect(status).toBe(201);
		expect(TripDetail.allows(json)).toBe(true);
	});

	it("延期以外で日付が無ければ 400 で、理由を返す", async () => {
		const { json, status } = await call("POST", "/trips", { title: "x" });
		expect(status).toBe(400);
		expect(json).toEqual({
			error: { code: 400, message: expect.stringMatching(MISSING_DATES) },
		});
	});

	it.each([
		[
			"31 日を超える期間",
			{ endDate: "2026-12-31", startDate: "2026-10-01", title: "x" },
		],
		["題名なし", { status: "postponed" }],
		[
			"終了日が開始日より前",
			{
				endDate: "2026-10-01",
				startDate: "2026-10-10",
				title: "x",
			},
		],
	])("%s は 400", async (_, body) => {
		expect((await call("POST", "/trips", body)).status).toBe(400);
	});
});

describe("GET /api/trips/:id", () => {
	it("200 で詳細を返す", async () => {
		const trip = await newTrip();
		const { json, status } = await call("GET", `/trips/${trip.id}`);
		expect(status).toBe(200);
		expect(TripDetail.allows(json)).toBe(true);
	});

	it.each(notMine)("%s は 404", async (_, tripId) => {
		const { json, status } = await call("GET", `/trips/${await tripId()}`);
		expect(status).toBe(404);
		expect(json).toEqual(errorBody(404));
	});
});

describe("PATCH /api/trips/:id", () => {
	it("200 で変更後の詳細を返す", async () => {
		const trip = await newTrip();
		const { json, status } = await call("PATCH", `/trips/${trip.id}`, {
			title: "A",
			updatedAt: trip.updatedAt,
		});
		expect(status).toBe(200);
		expect(TripDetail.allows(json)).toBe(true);
		expect(json).toMatchObject({ title: "A" });
	});

	it("updatedAt なしは 400", async () => {
		const trip = await newTrip();
		const { status } = await call("PATCH", `/trips/${trip.id}`, { title: "A" });
		expect(status).toBe(400);
	});

	it("古い updatedAt は 409", async () => {
		const trip = await newTrip();
		const { json, status } = await call("PATCH", `/trips/${trip.id}`, {
			title: "A",
			updatedAt: STALE,
		});
		expect(status).toBe(409);
		expect(json).toEqual(errorBody(409));
	});

	it("他人の旅程は updatedAt が合っていても 404", async () => {
		const others = await othersTrip();
		const { status } = await call("PATCH", `/trips/${others.id}`, {
			title: "A",
			updatedAt: others.updatedAt,
		});
		expect(status).toBe(404);
	});
});

describe("DELETE /api/trips/:id", () => {
	it("200 で消した id を返す", async () => {
		const trip = await newTrip();
		const { json, status } = await call(
			"DELETE",
			`/trips/${trip.id}?updatedAt=${trip.updatedAt}`,
		);
		expect(status).toBe(200);
		expect(json).toEqual({ id: trip.id });
	});

	it("updatedAt なしは 400", async () => {
		const trip = await newTrip();
		expect((await call("DELETE", `/trips/${trip.id}`)).status).toBe(400);
	});

	it("古い updatedAt は 409", async () => {
		const trip = await newTrip();
		const { status } = await call(
			"DELETE",
			`/trips/${trip.id}?updatedAt=${STALE}`,
		);
		expect(status).toBe(409);
	});

	it("他人の旅程は updatedAt が合っていても 404", async () => {
		const others = await othersTrip();
		const { status } = await call(
			"DELETE",
			`/trips/${others.id}?updatedAt=${others.updatedAt}`,
		);
		expect(status).toBe(404);
	});
});
