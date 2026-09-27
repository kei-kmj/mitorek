import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeocodeResult, PlaceCandidate } from "../../src/schemas/places";
import { fakeGeocodeApis } from "../fake-geocode";
import { seedFixture } from "../fixtures";
import { call, errorBody } from "../trip-helpers";

/** 検索語の長さの制限 (2〜50 文字) に掛かるもの */
const badQueries = [
	["q なし", ""],
	["1 文字", "?q=a"],
	["51 文字", `?q=${"a".repeat(51)}`],
] as const;

beforeEach(seedFixture);

describe("GET /api/places/search", () => {
	it("200 で候補の一覧を返す", async () => {
		const { json, status } = await call(
			"GET",
			`/places/search?q=${encodeURIComponent("姫路")}`,
		);
		expect(status).toBe(200);
		expect(PlaceCandidate.array().allows(json)).toBe(true);
		expect(json).toHaveLength(2);
	});

	it.each(badQueries)("%s は 400", async (_, query) => {
		const { json, status } = await call("GET", `/places/search${query}`);
		expect(status).toBe(400);
		expect(json).toEqual(errorBody(400));
	});
});

describe("GET /api/places/geocode (国土地理院と Nominatim は差し替え)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("200 で候補を返す", async () => {
		fakeGeocodeApis();
		const { json, status } = await call(
			"GET",
			`/places/geocode?q=${encodeURIComponent("姫路の宿")}`,
		);
		expect(status).toBe(200);
		expect(GeocodeResult.array().allows(json)).toBe(true);
	});

	it("施設名の補足の県名は、県コードから DB の県名を引く", async () => {
		// Nominatim は県コード (JP-28) だけ返す。県名は prefectures 表から引く
		fakeGeocodeApis({ gsi: [] });
		const { json } = await call(
			"GET",
			`/places/geocode?q=${encodeURIComponent("姫路の宿")}`,
		);
		expect(json).toMatchObject([{ detail: "兵庫県姫路市", source: "osm" }]);
	});

	it.each(badQueries)(
		"%s は 400 で、外には問い合わせない",
		async (_, query) => {
			const fetch = fakeGeocodeApis();
			const { status } = await call("GET", `/places/geocode${query}`);
			expect(status).toBe(400);
			expect(fetch).not.toHaveBeenCalled();
		},
	);
});

describe("POST /api/places", () => {
	const valid = { kind: "hotel", lat: 34.83, lng: 134.69, name: "姫路の宿" };

	it("201 で登録した地点を候補の形で返す", async () => {
		const { json, status } = await call("POST", "/places", valid);
		expect(status).toBe(201);
		expect(PlaceCandidate.allows(json)).toBe(true);
		expect(json).toMatchObject({ kind: "hotel", type: "custom" });
	});

	it.each([
		["緯度が範囲外", { ...valid, lat: 99 }],
		["種類が不正", { ...valid, kind: "castle" }],
		["名前が空", { ...valid, name: "" }],
		["名前が 101 文字", { ...valid, name: "あ".repeat(101) }],
	])("%s は 400", async (_, body) => {
		const { json, status } = await call("POST", "/places", body);
		expect(status).toBe(400);
		expect(json).toEqual(errorBody(400));
	});
});
