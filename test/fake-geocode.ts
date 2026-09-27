import { vi } from "vitest";

/**
 * 国土地理院と Nominatim の代わり。fetch を差し替え、URL の行き先ごとに決めた応答を返す。
 * null を渡した方は 500 を返す (落ちたときの確かめ用)。afterEach で vi.restoreAllMocks() する
 */

const GSI_HOST = "msearch.gsi.go.jp";
const NOMINATIM_HOST = "nominatim.openstreetmap.org";

/** 国土地理院: 住所 1 件 (姫路市本町) */
export const GSI_FEATURES = [
	{
		geometry: { coordinates: [134.6939, 34.8394] },
		properties: { title: "兵庫県姫路市本町" },
	},
];

/** Nominatim: ホテル 1 件。県名 (province) が無く、県コードだけある */
export const NOMINATIM_PLACES = [
	{
		address: { city: "姫路市", "ISO3166-2-lvl4": "JP-28" },
		display_name: "姫路の宿, 姫路市, 日本",
		lat: "34.83",
		lon: "134.69",
		name: "姫路の宿",
	},
];

const reply = (body: unknown) =>
	body === null ? new Response("error", { status: 500 }) : Response.json(body);

export const fakeGeocodeApis = ({
	gsi = GSI_FEATURES as unknown,
	osm = NOMINATIM_PLACES as unknown,
} = {}) =>
	vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		if (url.host === GSI_HOST) {
			return Promise.resolve(reply(gsi));
		}
		if (url.host === NOMINATIM_HOST) {
			return Promise.resolve(reply(osm));
		}
		return Promise.reject(new Error(`unexpected fetch: ${url}`));
	});
