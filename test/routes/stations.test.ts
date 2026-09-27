import { beforeEach, describe, expect, it } from "vitest";
import { Station } from "../../src/schemas/stations";
import { seedFixture } from "../fixtures";
import { call, errorBody } from "../trip-helpers";

beforeEach(seedFixture);

describe("GET /api/stations", () => {
	it("200 で bbox 内の駅を返す", async () => {
		const { json, status } = await call(
			"GET",
			"/stations?bbox=134.6,34.78,134.75,34.88",
		);
		expect(status).toBe(200);
		expect(Station.array().allows(json)).toBe(true);
		expect(json).toHaveLength(2);
	});

	it.each([
		["bbox なし", ""],
		["数が 3 つ", "?bbox=134.6,34.78,134.75"],
		["1 度を超える範囲", "?bbox=134,34,135.5,35"],
	])("%s は 400", async (_, query) => {
		const { json, status } = await call("GET", `/stations${query}`);
		expect(status).toBe(400);
		expect(json).toEqual(errorBody(400));
	});
});
