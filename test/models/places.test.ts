import { beforeEach, describe, expect, it } from "vitest";
import { spots } from "../../src/db/schema/master";
import { stations } from "../../src/db/schema/rail";
import { createCustomPlace, searchPlaces } from "../../src/models/places";
import { ME, seedFixture } from "../fixtures";
import { testDb } from "../trip-helpers";

const search = (q: string) => searchPlaces(testDb(), ME, q);

beforeEach(async () => {
	await seedFixture();
	await testDb()
		.insert(spots)
		.values([
			{
				collectionId: "dqw.castle",
				id: "percent",
				lat: 34.8,
				lng: 134.6,
				name: "100%オレンジ",
				nameKana: "ひゃくぱーせんとおれんじ",
			},
			{
				collectionId: "dqw.castle",
				id: "nagashima",
				lat: 35.03,
				lng: 136.73,
				name: "ナガシマスパーランド",
			},
		]);
});

describe("searchPlaces: 何が当たるか", () => {
	it.each([
		["スポットと駅の両方", "姫路", ["castle", "himeji"]],
		// 駅名は「駅」なしで登録されている
		["「〇〇駅」の入力で駅", "姫路駅", ["himeji"]],
		["スポットのふりがな", "ひゃく", ["percent"]],
		// ふりがな (ひらがな) にもカタカナの入力で当たる
		["ふりがなにカタカナの入力", "ヒャクパセント", ["percent"]],
		["長音の有無の違い", "ナガシマスパランド", ["nagashima"]],
		["ひらがなの入力", "ながしますぱーらんど", ["nagashima"]],
		["空白入りの入力", "ナガシマ スパー", ["nagashima"]],
		// % は文字として扱う (全件一致にならない)
		["% を含む名前", "0%", ["percent"]],
		["% だけの入力", "%%", []],
		["自分の登録地点", "ホテル", ["hotel"]],
		["他人の登録地点", "他人の", []],
	])("%s: %s → %j", async (_, q, ids) => {
		expect((await search(q)).map((p) => p.id)).toEqual(ids);
	});
});

describe("searchPlaces: 候補の補足", () => {
	it("スポットには県名を添える", async () => {
		const [spot] = await search("姫路城");
		expect(spot?.detail).toBe("兵庫県");
	});

	it("駅には県名と、通る路線を添える", async () => {
		const [station] = await search("姫路駅");
		// 路線の並びは決めていないので、順は問わない
		const [prefecture, lineNames] = station?.detail?.split(" ") ?? [];
		expect(prefecture).toBe("兵庫県");
		expect(lineNames?.split("・").sort()).toEqual(["播但線", "山陽線"].sort());
	});

	it("路線が無い駅も、県名は添える", async () => {
		await testDb().insert(stations).values({
			id: "no-line",
			lat: 34.8,
			lng: 134.7,
			name: "路線なし",
			prefectureCode: "JP-28",
			source: "test",
			sourceCode: "99",
		});
		expect((await search("路線なし"))[0]?.detail).toBe("兵庫県");
	});
});

describe("createCustomPlace", () => {
	it("登録した地点が検索に出る", async () => {
		await createCustomPlace(testDb(), ME, {
			kind: "hotel",
			lat: 34.83,
			lng: 134.69,
			name: "姫路の宿",
		});
		expect((await search("姫路の宿"))[0]).toMatchObject({
			kind: "hotel",
			type: "custom",
		});
	});
});
