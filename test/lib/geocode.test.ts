import { afterEach, describe, expect, it, vi } from "vitest";
import { geocode, parseGsi, parseNominatim } from "../../src/lib/geocode";
import { fakeGeocodeApis } from "../fake-geocode";

const MITOREK = /^mitorek\//u;

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
	const nameOf = (name: string, original: string) =>
		parseNominatim([
			{
				display_name: name,
				lat: "35.67",
				lon: "139.77",
				name,
				namedetails: { brand: "アパホテル", name: original },
			},
		])[0]?.name;

	it.each([
		// 日本語名がブランド名だけなら、支店まで入った元の名前を使う
		["アパホテル", "アパホテル 銀座 宝町", "アパホテル 銀座 宝町"],
		// 日本語名の方が詳しければそのまま
		["アパホテル神保町", "アパホテル", "アパホテル神保町"],
	])("日本語名 %s・元の名前 %s → %s", (name, original, expected) => {
		expect(nameOf(name, original)).toBe(expected);
	});
});

describe("Nominatim のチェーン店", () => {
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

	it("支店名を名前に続ける", () => {
		expect(place?.name).toBe("アパホテル 新宿歌舞伎町中央");
	});

	it("番地を補足に足す", () => {
		expect(place?.detail).toBe("東京都新宿区歌舞伎町二丁目 5");
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

describe("geocode (国土地理院と Nominatim は差し替え)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	const noPrefecture = () => undefined;

	it("施設名 (Nominatim) の候補を先に、住所 (国土地理院) を後に並べる", async () => {
		fakeGeocodeApis();
		const found = await geocode("姫路 宿", noPrefecture);
		expect(found.map((r) => [r.source, r.name])).toEqual([
			["osm", "姫路の宿"],
			["gsi", "兵庫県姫路市本町"],
		]);
	});

	it("両方に同じ検索語で問い合わせる", async () => {
		const fetch = fakeGeocodeApis();
		await geocode("姫路 宿", noPrefecture);
		const urls = fetch.mock.calls.map(([input]) => new URL(String(input)));
		expect(urls.map((u) => [u.host, u.searchParams.get("q")])).toEqual([
			["nominatim.openstreetmap.org", "姫路 宿"],
			["msearch.gsi.go.jp", "姫路 宿"],
		]);
	});

	it("Nominatim にはアプリ名で名乗り、日本に絞って日本語で引く", async () => {
		const fetch = fakeGeocodeApis();
		await geocode("姫路", noPrefecture);
		const [input, init] = fetch.mock.calls[0] ?? [];
		const url = new URL(String(input));
		expect(url.searchParams.get("countrycodes")).toBe("jp");
		expect(url.searchParams.get("accept-language")).toBe("ja");
		expect(new Headers(init?.headers).get("user-agent")).toMatch(MITOREK);
	});

	it.each([
		["Nominatim", { osm: null }, ["gsi"]],
		["国土地理院", { gsi: null }, ["osm"]],
	])(
		"%s が落ちても、もう片方の候補は返し、失敗はログに残す",
		async (_, down, sources) => {
			const log = vi
				.spyOn(console, "error")
				.mockImplementation(() => undefined);
			fakeGeocodeApis(down);
			const found = await geocode("姫路", noPrefecture);
			expect(found.map((r) => r.source)).toEqual(sources);
			expect(log).toHaveBeenCalledOnce();
		},
	);
});
