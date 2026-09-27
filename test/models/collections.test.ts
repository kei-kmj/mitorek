import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../src/db/client";
import { listCollections } from "../../src/models/collections";
import { insertSpotVisits, ME, seedFixture } from "../fixtures";

beforeEach(async () => {
	await seedFixture();
	await insertSpotVisits();
});

describe("listCollections", () => {
	it("スポット数と自分の訪問済み数を数える。廃止は分母に入れない", async () => {
		const rows = await listCollections(createDb(env.mitorek_db), ME);
		expect(rows).toEqual([
			{ icon: null, id: "dqw.castle", name: "城", total: 2, visited: 1 },
			{ icon: null, id: "dqw.souvenir", name: "お土産", total: 1, visited: 0 },
		]);
	});
});
