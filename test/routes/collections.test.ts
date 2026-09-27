import { beforeEach, describe, expect, it } from "vitest";
import { Collection } from "../../src/schemas/collections";
import { seedFixture } from "../fixtures";
import { call } from "../trip-helpers";

beforeEach(seedFixture);

describe("GET /api/collections", () => {
	it("200 でコレクションの一覧を返す", async () => {
		const { json, status } = await call("GET", "/collections");
		expect(status).toBe(200);
		expect(Collection.array().allows(json)).toBe(true);
		expect(json).toHaveLength(2);
	});
});
