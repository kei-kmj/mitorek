import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { prefectures, regions } from "../src/db/schema/master";
import {
	lines,
	railOperators,
	stationLines,
	stations,
} from "../src/db/schema/rail";
import app from "../src/index";
import { listStationsIn } from "../src/models/stations";

const HIMEJI_AREA = { east: 134.75, north: 34.88, south: 34.78, west: 134.6 };

// 取り込み元は "test"、元コードは行ごとに連番を振る
const line = (
	id: string,
	name: string,
	operatorId: string | null,
	n: number,
) => ({
	countryCode: "JP",
	id,
	name,
	operatorId,
	source: "test",
	sourceCode: String(n),
});
const station = (
	id: string,
	name: string,
	[lat, lng]: [number, number],
	n: number,
) => ({
	id,
	lat,
	lng,
	name,
	prefectureCode: "JP-28",
	source: "test",
	sourceCode: String(n),
});

beforeEach(async () => {
	const db = createDb(env.mitorek_db);
	await db.batch([
		db.insert(regions).values({ id: "kinki", name: "近畿" }),
		db.insert(prefectures).values({
			code: "JP-28",
			countryCode: "JP",
			name: "兵庫県",
			regionId: "kinki",
			sortOrder: 28,
		}),
		db.insert(railOperators).values([
			{ id: "jrw", name: "西日本旅客鉄道", source: "test", sourceCode: "1" },
			{ id: "sanyo", name: "山陽電気鉄道", source: "test", sourceCode: "2" },
		]),
		db
			.insert(lines)
			.values([
				line("sanyo-line", "山陽線", "jrw", 1),
				line("bantan", "播但線", "jrw", 2),
				line("honsen", "本線", "sanyo", 3),
				line("unknown-op", "謎線", null, 4),
			]),
		db.insert(stations).values([
			station("himeji", "姫路", [34.827_15, 134.690_638], 1),
			station("kameyama", "亀山", [34.810_655, 134.676_75], 2),
			// 矩形の外の対照
			station("osaka", "大阪", [34.702_519, 135.494_663], 3),
		]),
		db.insert(stationLines).values([
			{ lineId: "sanyo-line", stationId: "himeji" },
			{ lineId: "bantan", stationId: "himeji" },
			{ lineId: "honsen", stationId: "kameyama" },
			{ lineId: "unknown-op", stationId: "kameyama" },
			{ lineId: "sanyo-line", stationId: "osaka" },
		]),
	]);
});

describe("listStationsIn", () => {
	it("矩形内の駅だけを、路線 (事業者付き) とともに返す", async () => {
		const rows = await listStationsIn(createDb(env.mitorek_db), HIMEJI_AREA);
		// 駅名順 (コードポイント): 亀(4E80) < 姫(59EB)
		expect(rows.map((r) => r.id)).toEqual(["kameyama", "himeji"]);

		const himeji = rows.find((r) => r.id === "himeji");
		expect(himeji?.lines).toHaveLength(2);
		expect(himeji?.lines).toEqual(
			expect.arrayContaining([
				{ name: "山陽線", operator: "西日本旅客鉄道" },
				{ name: "播但線", operator: "西日本旅客鉄道" },
			]),
		);
	});

	it("事業者が無い路線は operator: null", async () => {
		const rows = await listStationsIn(createDb(env.mitorek_db), HIMEJI_AREA);
		const kameyama = rows.find((r) => r.id === "kameyama");
		expect(kameyama?.lines).toEqual(
			expect.arrayContaining([{ name: "謎線", operator: null }]),
		);
	});
});

describe("GET /api/stations", () => {
	it("bbox で絞って返す", async () => {
		const res = await app.request(
			"/api/stations?bbox=134.6,34.78,134.75,34.88",
			{},
			env,
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toHaveLength(2);
	});

	it("bbox なしは 400", async () => {
		const res = await app.request("/api/stations", {}, env);
		expect(res.status).toBe(400);
	});

	it("1 度を超える範囲は 400", async () => {
		const res = await app.request(
			"/api/stations?bbox=134,34,135.5,35",
			{},
			env,
		);
		expect(res.status).toBe(400);
	});
});
