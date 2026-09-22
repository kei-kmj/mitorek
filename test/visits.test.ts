import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { spots } from "../src/db/schema/master";
import { visits } from "../src/db/schema/visits";
import type { Visit } from "../src/schemas/visits";
import { call, OTHER, seedTripFixture } from "./trip-helpers";

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

beforeEach(seedTripFixture);

const visited = async () =>
	((await call("GET", "/spots/castle")).json as unknown as { visited: boolean })
		.visited;

describe("訪問の記録", () => {
	it("「行った」で記録すると、スポットが訪問済みになり、一覧に出る", async () => {
		expect(await visited()).toBe(false);
		const { json, status } = await call("POST", "/visits", {
			lat: 34.839,
			lng: 134.694,
			spotId: "castle",
		});
		const visit = json as unknown as Visit;
		expect(status).toBe(201);
		expect(visit.visitedAt).toMatch(ISO_DATETIME);
		expect(visit).toMatchObject({ lat: 34.839, lng: 134.694 });
		expect(await visited()).toBe(true);
		const list = (await call("GET", "/visits?spotId=castle"))
			.json as unknown as Visit[];
		expect(list.map((v) => v.id)).toEqual([visit.id]);
	});

	it("取り消すと未訪問に戻る", async () => {
		const visit = (await call("POST", "/visits", { spotId: "castle" }))
			.json as unknown as Visit;
		expect((await call("DELETE", `/visits/${visit.id}`)).status).toBe(200);
		expect(await visited()).toBe(false);
	});

	it("他人の訪問は取り消せない (404) し、一覧にも出ない", async () => {
		await createDb(env.mitorek_db)
			.insert(visits)
			.values({ id: "others", spotId: "castle", userId: OTHER });
		expect((await call("DELETE", "/visits/others")).status).toBe(404);
		expect((await call("GET", "/visits?spotId=castle")).json).toEqual([]);
	});

	it("廃止したスポット・無いスポットには記録できない (404)", async () => {
		await createDb(env.mitorek_db).insert(spots).values({
			collectionId: "dqw.castle",
			id: "gone",
			lat: 34,
			lng: 134,
			name: "廃止",
			retiredAt: "2025-01-01",
		});
		expect((await call("POST", "/visits", { spotId: "gone" })).status).toBe(
			404,
		);
		expect((await call("POST", "/visits", { spotId: "missing" })).status).toBe(
			404,
		);
	});
});
