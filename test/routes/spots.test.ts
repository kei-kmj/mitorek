import { beforeEach, describe, expect, it } from "vitest";
import { NearbySpot, Spot } from "../../src/schemas/spots";
import { ids, seedFixture } from "../fixtures";
import { call, errorBody } from "../trip-helpers";

beforeEach(seedFixture);

describe("GET /api/spots", () => {
	it("200 でスポットの一覧を返す", async () => {
		const { json, status } = await call("GET", "/spots");
		expect(status).toBe(200);
		expect(Spot.array().allows(json)).toBe(true);
	});

	it.each([["1"], ["true"], ["0"], ["false"]])(
		"unvisited=%s を旗として受ける",
		async (flag) => {
			expect((await call("GET", `/spots?unvisited=${flag}`)).status).toBe(200);
		},
	);

	it.each([
		["壊れた bbox", "bbox=1,2,3"],
		["旗でない unvisited", "unvisited=yes"],
	])("%s は 400", async (_, query) => {
		const { json, status } = await call("GET", `/spots?${query}`);
		expect(status).toBe(400);
		expect(json).toEqual(errorBody(400));
	});
});

describe("GET /api/spots/nearby", () => {
	it("200 で近い順に返す", async () => {
		const { json, status } = await call(
			"GET",
			"/spots/nearby?lat=34.8267&lng=134.6906&r=2000",
		);
		expect(status).toBe(200);
		expect(NearbySpot.array().allows(json)).toBe(true);
		expect(ids(json as NearbySpot[])).toEqual(["garden", "castle"]);
	});

	it("r 省略時は既定半径 (2km) を使う", async () => {
		// 姫路城 (約 1.4km) は既定の 2km に入る
		const { json } = await call(
			"GET",
			"/spots/nearby?lat=34.8267&lng=134.6906",
		);
		expect(ids(json as NearbySpot[])).toContain("castle");
	});

	it.each([
		["中心なし", ""],
		["範囲外の緯度", "?lat=999&lng=134"],
		["数でない経度", "?lat=34&lng=east"],
	])("%s は 400", async (_, query) => {
		expect((await call("GET", `/spots/nearby${query}`)).status).toBe(400);
	});
});

describe("GET /api/spots/:id", () => {
	it("200 でスポットを返す", async () => {
		const { json, status } = await call("GET", "/spots/castle");
		expect(status).toBe(200);
		expect(Spot.allows(json)).toBe(true);
	});

	it("無い id は 404 を { error } で返す", async () => {
		const { json, status } = await call("GET", "/spots/missing");
		expect(status).toBe(404);
		expect(json).toEqual({ error: { code: 404, message: "spot not found" } });
	});
});
