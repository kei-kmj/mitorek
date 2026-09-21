import type { GeocodeResult } from "../schemas/places";

/**
 * 地点の登録に使う、住所・施設名からの座標検索。ブラウザからは CORS で呼べないので Worker から呼ぶ。
 * - 国土地理院 地名検索 API: 住所・地名に強い。施設名はほぼ引けない
 *   https://msearch.gsi.go.jp/address-search/AddressSearch?q=
 * - OpenStreetMap Nominatim: 施設名 (ホテルなど) が引ける。© OpenStreetMap contributors (ODbL)
 *   https://nominatim.org/release-docs/latest/api/Search/
 *   利用規約 (https://operations.osmfoundation.org/policies/nominatim/) に従い、
 *   入力のたびの検索 (オートコンプリート) はせず、ボタンを押したときだけ呼ぶ。アプリ名で名乗る
 */
const GSI = "https://msearch.gsi.go.jp/address-search/AddressSearch";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
/** Nominatim は名乗り (User-Agent) を求める。個人の連絡先は入れない */
const USER_AGENT = "mitorek/0.1 (personal non-commercial trip planner)";
const MAX_RESULTS = 10;

interface GsiFeature {
	geometry: { coordinates: [number, number] };
	properties: { title: string };
}

/** addressdetails=1 の住所要素のうち使うもの (キー名は Nominatim のまま) */
interface NominatimAddress {
	city?: string;
	/** 番地 (5 / 5-1)。入っていない施設も多い */
	// biome-ignore lint/style/useNamingConvention: Nominatim の応答のキー名そのまま
	house_number?: string;
	"ISO3166-2-lvl4"?: string;
	/** 町名・丁目 (本庄一丁目) */
	neighbourhood?: string;
	province?: string;
	/** 大字・町名 (中条) */
	quarter?: string;
	suburb?: string;
	town?: string;
	village?: string;
}

interface NominatimPlace {
	address?: NominatimAddress;
	// biome-ignore lint/style/useNamingConvention: Nominatim の応答のキー名そのまま
	display_name: string;
	/** extratags=1 の追加タグ。チェーン店の支店名 (branch) を使う */
	extratags?: { branch?: string } | null;
	lat: string;
	lon: string;
	name: string;
	/** namedetails=1 の名前の一覧。name は地図に登録された元の名前、brand はチェーン名 */
	namedetails?: { brand?: string; name?: string } | null;
}

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
	const res = await fetch(url, init);
	if (!res.ok) {
		throw new Error(`${res.status} ${url}`);
	}
	return (await res.json()) as T;
};

/** 県コード (JP-13) → 県名。Nominatim は東京都などで province を返さないので、コードから引く */
type PrefectureName = (code: string) => string | undefined;

/**
 * 補足は「県 + 市区町村 + 町名・丁目 (+ 番地)」(東京都新宿区歌舞伎町二丁目 5)。
 * 同じ区に同名チェーンのホテルが複数あっても見分けられるよう、分かる範囲で細かくする。郵便番号は要らない
 */
const shortAddress = (
	address: NominatimAddress | undefined,
	prefectureName: PrefectureName,
): string | null => {
	const code = address?.["ISO3166-2-lvl4"];
	let prefecture = address?.province;
	if (prefecture === undefined && code !== undefined) {
		prefecture = prefectureName(code);
	}
	const city = address?.city ?? address?.town ?? address?.village;
	const area = address?.neighbourhood ?? address?.quarter ?? address?.suburb;
	const text = `${prefecture ?? ""}${city ?? ""}${area ?? ""}`;
	if (!text) {
		return null;
	}
	if (address?.house_number) {
		return `${text} ${address.house_number}`;
	}
	return text;
};

/**
 * name:ja がブランド名そのものなら元の名前を、そうでなければ name:ja を使う。
 * accept-language=ja だと name は name:ja になり、チェーン店ではそれがブランド名 (アパホテル) だけのことがある。
 * そのときは支店まで入っていることの多い元の名前 (アパホテル 銀座 宝町) を使う。
 * name:ja の方が詳しい施設 (アパホテル神保町) もあるので、ブランド名と同じときだけ置き換える
 */
const baseName = (p: NominatimPlace): string => {
	const japanese = p.name || p.display_name;
	const original = p.namedetails?.name;
	if (original && p.namedetails?.brand === japanese) {
		return original;
	}
	return japanese;
};

/**
 * 施設名を名前に、住所を補足にする。チェーン店は支店名を名前に続ける (アパホテル 新宿歌舞伎町中央)。
 * 名前が無い結果は住所全体を名前にする
 */
const placeName = (p: NominatimPlace): string => {
	const name = baseName(p);
	const branch = p.extratags?.branch;
	if (branch && !name.includes(branch)) {
		return `${name} ${branch}`;
	}
	return name;
};

export const parseGsi = (features: GsiFeature[]): GeocodeResult[] =>
	features.slice(0, MAX_RESULTS).map((f) => ({
		detail: null,
		lat: f.geometry.coordinates[1],
		lng: f.geometry.coordinates[0],
		name: f.properties.title,
		source: "gsi",
	}));

/** Nominatim の応答を候補にする */
export const parseNominatim = (
	places: NominatimPlace[],
	prefectureName: PrefectureName = () => undefined,
): GeocodeResult[] =>
	places.slice(0, MAX_RESULTS).map((p) => ({
		detail: shortAddress(p.address, prefectureName),
		lat: Number(p.lat),
		lng: Number(p.lon),
		name: placeName(p),
		source: "osm",
	}));

/**
 * 住所 (国土地理院) と施設名 (Nominatim) を同時に探し、施設名の候補を先に並べる。
 * 片方が失敗しても、もう片方の結果は返す
 */
export const geocode = async (
	q: string,
	prefectureName: PrefectureName,
): Promise<GeocodeResult[]> => {
	const query = encodeURIComponent(q);
	const [osm, gsi] = await Promise.allSettled([
		fetchJson<NominatimPlace[]>(
			`${NOMINATIM}?format=jsonv2&addressdetails=1&extratags=1&namedetails=1&countrycodes=jp&accept-language=ja&limit=${MAX_RESULTS}&q=${query}`,
			{ headers: { "user-agent": USER_AGENT } },
		).then((places) => parseNominatim(places, prefectureName)),
		fetchJson<GsiFeature[]>(`${GSI}?q=${query}`).then(parseGsi),
	]);
	const ok = (r: PromiseSettledResult<GeocodeResult[]>) => {
		if (r.status === "fulfilled") {
			return r.value;
		}
		// biome-ignore lint/suspicious/noConsole: 片方の失敗は Workers のログにだけ残す
		console.error(r.reason);
		return [];
	};
	return [...ok(osm), ...ok(gsi)];
};
