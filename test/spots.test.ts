import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import {
	collections,
	games,
	prefectures,
	regions,
	spots,
} from "../src/db/schema/master";
import { users } from "../src/db/schema/users";
import { visits } from "../src/db/schema/visits";
import app from "../src/index";
import { listCollections } from "../src/models/collections";
import { findNearbyUnvisited, findSpot, listSpots } from "../src/models/spots";

// 姫路駅を中心に、近い順に 好古園 (約 1.2km) → 姫路城 (約 1.4km)。東京は遠方の対照
const HIMEJI_STATION = { lat: 34.8267, lng: 134.6906 };
const ME = "u-me";
const OTHER = "u-other";

const spot = (
	id: string,
	name: string,
	[lat, lng]: [number, number],
	extra: Partial<typeof spots.$inferInsert> = {},
) => ({
	collectionId: "dqw.castle",
	id,
	lat,
	lng,
	name,
	prefectureCode: "JP-28",
	...extra,
});

beforeEach(async () => {
	const db = createDb(env.mitorek_db);
	await db.batch([
		db.insert(games).values({ id: "dqw", name: "DQW" }),
		db.insert(regions).values([
			{ id: "kinki", name: "近畿" },
			{ id: "kanto", name: "関東" },
		]),
		db.insert(prefectures).values([
			{
				code: "JP-28",
				countryCode: "JP",
				name: "兵庫県",
				regionId: "kinki",
				sortOrder: 28,
			},
			{
				code: "JP-13",
				countryCode: "JP",
				name: "東京都",
				regionId: "kanto",
				sortOrder: 13,
			},
		]),
		db.insert(collections).values([
			{ gameId: "dqw", id: "dqw.castle", name: "城" },
			{ gameId: "dqw", id: "dqw.souvenir", name: "お土産" },
		]),
		db.insert(spots).values([
			spot("castle", "姫路城", [34.8394, 134.6939]),
			spot("garden", "好古園", [34.8378, 134.6899], {
				collectionId: "dqw.souvenir",
			}),
			spot("tokyo", "江戸城", [35.6852, 139.7528], { prefectureCode: "JP-13" }),
			spot("retired", "廃止スポット", [34.827, 134.691], {
				retiredAt: "2025-04-30",
			}),
		]),
		db.insert(users).values([
			{ email: "me@example.com", id: ME },
			{ email: "other@example.com", id: OTHER },
		]),
		// 自分は姫路城に訪問済み。他人の好古園訪問は自分の「訪問済み」に数えない
		db.insert(visits).values([
			{ id: "v1", spotId: "castle", userId: ME },
			{ id: "v2", spotId: "garden", userId: OTHER },
		]),
	]);
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

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

	it("collection / pref / bbox で絞る", async () => {
		const db = createDb(env.mitorek_db);
		expect(
			ids(await listSpots(db, ME, { collection: "dqw.souvenir" })),
		).toEqual(["garden"]);
		expect(ids(await listSpots(db, ME, { pref: "JP-13" }))).toEqual(["tokyo"]);
		const kanto = { east: 140, north: 36, south: 35, west: 139 };
		expect(ids(await listSpots(db, ME, { bbox: kanto }))).toEqual(["tokyo"]);
	});
});

describe("findNearbyUnvisited", () => {
	it("半径内の未訪問を距離順に返す。訪問済み・廃止・圏外は除く", async () => {
		const rows = await findNearbyUnvisited(
			createDb(env.mitorek_db),
			OTHER,
			HIMEJI_STATION,
			2000,
		);
		// OTHER は好古園に訪問済み、姫路城は未訪問
		expect(ids(rows)).toEqual(["castle"]);
		expect(rows[0]?.distanceM).toBeGreaterThan(1300);
		expect(rows[0]?.distanceM).toBeLessThan(1600);
	});

	it("近い順に並ぶ", async () => {
		const rows = await findNearbyUnvisited(
			createDb(env.mitorek_db),
			"u-nobody",
			HIMEJI_STATION,
			2000,
		);
		expect(ids(rows)).toEqual(["garden", "castle"]);
	});

	it("半径より遠いものは矩形に入っても落とす", async () => {
		const rows = await findNearbyUnvisited(
			createDb(env.mitorek_db),
			"u-nobody",
			HIMEJI_STATION,
			1300,
		);
		expect(ids(rows)).toEqual(["garden"]);
	});
});

describe("findSpot", () => {
	it("廃止スポットも retired=true で返す", async () => {
		const row = await findSpot(createDb(env.mitorek_db), ME, "retired");
		expect(row?.retired).toBe(true);
	});

	it("存在しなければ undefined", async () => {
		expect(
			await findSpot(createDb(env.mitorek_db), ME, "missing"),
		).toBeUndefined();
	});
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

describe("GET /api/spots", () => {
	it("nearby は r 省略時に既定半径 (2km) を使う", async () => {
		const res = await app.request(
			"/api/spots/nearby?lat=34.8267&lng=134.6906",
			{},
			env,
		);
		expect(res.status).toBe(200);
		expect(ids(await res.json())).toEqual(["garden", "castle"]);
	});

	it("範囲外の緯度は 400", async () => {
		const res = await app.request("/api/spots/nearby?lat=999&lng=134", {}, env);
		expect(res.status).toBe(400);
	});

	it("壊れた bbox は 400", async () => {
		const res = await app.request("/api/spots?bbox=1,2,3", {}, env);
		expect(res.status).toBe(400);
	});

	it("存在しない id は 404 を { error } で返す", async () => {
		const res = await app.request("/api/spots/missing", {}, env);
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({
			error: { code: 404, message: "spot not found" },
		});
	});
});
