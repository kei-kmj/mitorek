import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { spots } from "../src/db/schema/master";
import type { PlaceCandidate } from "../src/schemas/places";
import { call, seedTripFixture } from "./trip-helpers";

const search = async (q: string) =>
	(await call("GET", `/places/search?q=${encodeURIComponent(q)}`))
		.json as unknown as PlaceCandidate[];

beforeEach(async () => {
	await seedTripFixture();
	await createDb(env.mitorek_db).insert(spots).values({
		collectionId: "dqw.castle",
		id: "percent",
		lat: 34.8,
		lng: 134.6,
		name: "100%オレンジ",
		nameKana: "ひゃくぱーせんとおれんじ",
	});
	await createDb(env.mitorek_db).insert(spots).values({
		collectionId: "dqw.castle",
		id: "nagashima",
		lat: 35.03,
		lng: 136.73,
		name: "ナガシマスパーランド",
	});
});

describe("GET /api/places/search", () => {
	it("スポットと駅を名前で探し、補足に県名を添える (路線が無い駅も県名は出る)", async () => {
		const found = await search("姫路");
		expect(found.map((p) => [p.type, p.name])).toEqual([
			["spot", "姫路城"],
			["station", "姫路"],
		]);
		expect(found[1]?.detail).toBe("兵庫県");
	});

	it("「〇〇駅」と打っても駅が見つかる (駅名は「駅」なしで登録されている)", async () => {
		expect((await search("姫路駅")).map((p) => [p.type, p.name])).toEqual([
			["station", "姫路"],
		]);
	});

	it("スポットはふりがなでも見つかる", async () => {
		expect((await search("ひゃく")).map((p) => p.id)).toEqual(["percent"]);
	});

	it("ひらがな・カタカナの違いと長音・空白の有無を区別しない", async () => {
		for (const q of [
			"ナガシマスパランド",
			"ながしますぱーらんど",
			"ナガシマ スパー",
		]) {
			// biome-ignore lint/performance/noAwaitInLoops: 1 件ずつ確かめたいだけ
			expect((await search(q)).map((p) => p.id)).toEqual(["nagashima"]);
		}
		// ふりがな (ひらがな) にもカタカナの入力で当たる
		expect((await search("ヒャクパセント")).map((p) => p.id)).toEqual([
			"percent",
		]);
	});

	it("% は文字として扱う (全件一致にならない)", async () => {
		expect((await search("0%")).map((p) => p.id)).toEqual(["percent"]);
		expect(await search("%%")).toEqual([]);
	});

	it("自分の登録地点だけが出る (他人の地点は出ない)", async () => {
		expect((await search("ホテル")).map((p) => p.id)).toEqual(["hotel"]);
		expect(await search("他人の")).toEqual([]);
	});
});

describe("POST /api/places", () => {
	it("登録した地点が検索に出る", async () => {
		const { status } = await call("POST", "/places", {
			kind: "hotel",
			lat: 34.83,
			lng: 134.69,
			name: "姫路の宿",
		});
		expect(status).toBe(201);
		expect((await search("姫路の宿"))[0]).toMatchObject({
			kind: "hotel",
			type: "custom",
		});
	});

	it("緯度が範囲外なら 400", async () => {
		const { status } = await call("POST", "/places", {
			kind: "other",
			lat: 99,
			lng: 134,
			name: "x",
		});
		expect(status).toBe(400);
	});
});
