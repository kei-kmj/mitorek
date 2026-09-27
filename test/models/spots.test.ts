import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../src/db/client";
import {
	findNearbyUnvisited,
	findSpot,
	listSpots,
} from "../../src/models/spots";
import {
	HIMEJI_STATION,
	ids,
	insertSpotVisits,
	ME,
	OTHER,
	seedFixture,
} from "../fixtures";

beforeEach(async () => {
	await seedFixture();
	await insertSpotVisits();
});

describe("listSpots", () => {
	it("廃止スポットを除き、名前順で返す", async () => {
		const rows = await listSpots(createDb(env.mitorek_db), ME, {});
		// SQLite の既定照合はコードポイント順: 好(597D) < 姫(59EB) < 江(6C5F)
		expect(ids(rows)).toEqual(["garden", "castle", "tokyo"]);
	});

	it("visited は利用者ごと。他人の訪問は含めない", async () => {
		const rows = await listSpots(createDb(env.mitorek_db), ME, {});
		const visited = Object.fromEntries(rows.map((r) => [r.id, r.visited]));
		expect(visited).toEqual({ castle: true, garden: false, tokyo: false });
	});

	it("unvisited=true で自分の訪問済みを除く", async () => {
		const rows = await listSpots(createDb(env.mitorek_db), ME, {
			unvisited: true,
		});
		expect(ids(rows)).toEqual(["garden", "tokyo"]);
	});

	it.each([
		["collection", { collection: "dqw.souvenir" }, ["garden"]],
		["pref", { pref: "JP-13" }, ["tokyo"]],
		[
			"bbox",
			{ bbox: { east: 140, north: 36, south: 35, west: 139 } },
			["tokyo"],
		],
	] as const)("%s で絞る", async (_, query, expected) => {
		const rows = await listSpots(createDb(env.mitorek_db), ME, query);
		expect(ids(rows)).toEqual(expected);
	});
});

describe("findNearbyUnvisited", () => {
	const nearby = (userId: string, radiusM: number) =>
		findNearbyUnvisited(
			createDb(env.mitorek_db),
			userId,
			HIMEJI_STATION,
			radiusM,
		);

	it("訪問済み・廃止・圏外を除く", async () => {
		// OTHER は好古園に訪問済み、姫路城は未訪問。廃止スポットは駅のすぐ近く
		expect(ids(await nearby(OTHER, 2000))).toEqual(["castle"]);
	});

	it("近い順に並べ、距離 (m) を添える", async () => {
		const rows = await nearby("u-nobody", 2000);
		expect(ids(rows)).toEqual(["garden", "castle"]);
		expect(rows[1]?.distanceM).toBeGreaterThan(1300);
		expect(rows[1]?.distanceM).toBeLessThan(1600);
	});

	it("半径より遠いものは矩形に入っても落とす", async () => {
		expect(ids(await nearby("u-nobody", 1300))).toEqual(["garden"]);
	});
});

describe("findSpot", () => {
	it("廃止スポットも retired=true で返す", async () => {
		const row = await findSpot(createDb(env.mitorek_db), ME, "retired");
		expect(row?.retired).toBe(true);
	});
});
