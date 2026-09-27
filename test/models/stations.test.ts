import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../src/db/client";
import { listStationsIn } from "../../src/models/stations";
import { seedFixture } from "../fixtures";

const HIMEJI_AREA = { east: 134.75, north: 34.88, south: 34.78, west: 134.6 };

beforeEach(seedFixture);

describe("listStationsIn", () => {
	it("矩形内の駅だけを、駅名順に返す", async () => {
		const rows = await listStationsIn(createDb(env.mitorek_db), HIMEJI_AREA);
		// 駅名順 (コードポイント): 亀(4E80) < 姫(59EB)。大阪は矩形の外
		expect(rows.map((r) => r.id)).toEqual(["kameyama", "himeji"]);
	});

	it("駅を通る路線を、事業者名とともに添える", async () => {
		const rows = await listStationsIn(createDb(env.mitorek_db), HIMEJI_AREA);
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
