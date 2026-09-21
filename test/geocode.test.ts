import { describe, expect, it } from "vitest";
import { parseGsi, parseNominatim } from "../src/lib/geocode";

describe("Nominatim の応答の変換", () => {
	it("Nominatim: 施設名を名前に、県・市区町村・町名を補足にする", () => {
		expect(
			parseNominatim([
				{
					address: {
						city: "松本市",
						neighbourhood: "本庄一丁目",
						province: "長野県",
						quarter: "中条",
					},
					display_name: "ブエナビスタ, 本庄一丁目, 松本市, 長野県, 日本",
					lat: "36.2277501",
					lon: "137.9680851",
					name: "ブエナビスタ",
				},
			]),
		).toEqual([
			{
				detail: "長野県松本市本庄一丁目",
				lat: 36.227_750_1,
				lng: 137.968_085_1,
				name: "ブエナビスタ",
				source: "osm",
			},
		]);
	});
});

describe("Nominatim の応答の変換 (足りない情報の補い方)", () => {
	it("Nominatim: 県名が無ければ県コードから引く (東京都は province が無い)", () => {
		const [place] = parseNominatim(
			[
				{
					address: {
						city: "千代田区",
						"ISO3166-2-lvl4": "JP-13",
						quarter: "内幸町",
					},
					display_name: "帝国ホテル東京, 千代田区, 日本",
					lat: "35.67",
					lon: "139.75",
					name: "帝国ホテル東京",
				},
			],
			(code) => ({ "JP-13": "東京都" })[code],
		);
		// 丁目が無ければ町名 (quarter) を使う
		expect(place?.detail).toBe("東京都千代田区内幸町");
	});

	it("Nominatim: 名前の無い結果は住所を名前にする", () => {
		const [place] = parseNominatim([
			{ display_name: "本庄一丁目, 松本市", lat: "36", lon: "137", name: "" },
		]);
		expect(place?.name).toBe("本庄一丁目, 松本市");
	});
});

describe("Nominatim の施設名の選び方", () => {
	it("Nominatim: 日本語名がブランド名だけなら元の名前を使い、詳しければ日本語名のまま", () => {
		const place = (name: string, original: string) =>
			parseNominatim([
				{
					display_name: name,
					lat: "35.67",
					lon: "139.77",
					name,
					namedetails: { brand: "アパホテル", name: original },
				},
			])[0]?.name;
		expect(place("アパホテル", "アパホテル 銀座 宝町")).toBe(
			"アパホテル 銀座 宝町",
		);
		expect(place("アパホテル神保町", "アパホテル")).toBe("アパホテル神保町");
	});

	it("Nominatim: 支店名を名前に続け、番地を補足に足す", () => {
		const [place] = parseNominatim([
			{
				address: {
					city: "新宿区",
					house_number: "5",
					neighbourhood: "歌舞伎町二丁目",
					province: "東京都",
				},
				display_name: "アパホテル, 新宿区",
				extratags: { branch: "新宿歌舞伎町中央" },
				lat: "35.69",
				lon: "139.70",
				name: "アパホテル",
			},
		]);
		expect(place).toMatchObject({
			detail: "東京都新宿区歌舞伎町二丁目 5",
			name: "アパホテル 新宿歌舞伎町中央",
		});
	});
});

describe("国土地理院の応答の変換", () => {
	it("国土地理院: [経度, 緯度] の順を lat / lng に直す", () => {
		expect(
			parseGsi([
				{
					geometry: { coordinates: [134.691_437, 34.828_102] },
					properties: { title: "兵庫県姫路市駅前町" },
				},
			]),
		).toEqual([
			{
				detail: null,
				lat: 34.828_102,
				lng: 134.691_437,
				name: "兵庫県姫路市駅前町",
				source: "gsi",
			},
		]);
	});
});
