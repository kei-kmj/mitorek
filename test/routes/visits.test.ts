import { beforeEach, describe, expect, it } from "vitest";
import { createVisit } from "../../src/models/visits";
import { Visit } from "../../src/schemas/visits";
import { insertOthersVisit, ME, seedFixture } from "../fixtures";
import { call, errorBody, testDb } from "../trip-helpers";

beforeEach(seedFixture);

describe("GET /api/visits", () => {
	it("200 でそのスポットの訪問を返す", async () => {
		await createVisit(testDb(), ME, { spotId: "castle" });
		const { json, status } = await call("GET", "/visits?spotId=castle");
		expect(status).toBe(200);
		expect(Visit.array().allows(json)).toBe(true);
		expect(json).toHaveLength(1);
	});

	it("spotId なしは 400", async () => {
		expect((await call("GET", "/visits")).status).toBe(400);
	});
});

describe("POST /api/visits", () => {
	it("201 で記録した訪問を返す", async () => {
		const { json, status } = await call("POST", "/visits", {
			lat: 34.839,
			lng: 134.694,
			spotId: "castle",
		});
		expect(status).toBe(201);
		expect(Visit.allows(json)).toBe(true);
	});

	it.each([
		["spotId なし", {}],
		["緯度が範囲外", { lat: 99, spotId: "castle" }],
		["経度が範囲外", { lng: 999, spotId: "castle" }],
	])("%s は 400", async (_, body) => {
		const { json, status } = await call("POST", "/visits", body);
		expect(status).toBe(400);
		expect(json).toEqual(errorBody(400));
	});

	it("無いスポットは 404", async () => {
		const { json, status } = await call("POST", "/visits", {
			spotId: "missing",
		});
		expect(status).toBe(404);
		expect(json).toEqual(errorBody(404));
	});
});

describe("DELETE /api/visits/:id", () => {
	it("200 で消した id を返す", async () => {
		const visit = await createVisit(testDb(), ME, { spotId: "castle" });
		const { json, status } = await call("DELETE", `/visits/${visit.id}`);
		expect(status).toBe(200);
		expect(json).toEqual({ id: visit.id });
	});

	it.each([
		["他人の訪問", "others"],
		["無い訪問", "missing"],
	])("%s は 404", async (_, visitId) => {
		await insertOthersVisit();
		expect((await call("DELETE", `/visits/${visitId}`)).status).toBe(404);
	});
});
