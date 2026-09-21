import { type } from "arktype";
import { customPlaceKinds } from "../db/schema/itinerary";
import { Latitude, Longitude } from "./geo";
import { Place } from "./trips";

// ---- 出力 ----
/** 検索の候補。Place に、見分けるための補足 (県名・路線など) を足したもの */
export const PlaceCandidate = Place.and({ detail: "string | null" });
export type PlaceCandidate = typeof PlaceCandidate.infer;

/** 住所・施設名検索の候補。まだ登録していない地点 */
export const GeocodeResult = type({
	/** 施設名の候補なら住所。住所の候補は null */
	detail: "string | null",
	lat: Latitude,
	lng: Longitude,
	name: "string",
	/** 出典: gsi = 国土地理院 (住所), osm = OpenStreetMap Nominatim (施設名) */
	source: "'gsi' | 'osm'",
});
export type GeocodeResult = typeof GeocodeResult.infer;

// ---- 入力 ----
/** 1 文字だと候補が多すぎるので 2 文字から */
export const PlaceSearchQuery = type({ q: "1 < string <= 50" });
export type PlaceSearchQuery = typeof PlaceSearchQuery.infer;

export const CustomPlaceKind = type.enumerated(...customPlaceKinds);

/** POST /api/places : ホテル・駐車場など、自分で使う地点を登録する */
export const CustomPlaceBody = type({
	kind: CustomPlaceKind,
	lat: Latitude,
	lng: Longitude,
	"memo?": "string <= 2000 | null",
	name: "0 < string <= 100",
});
export type CustomPlaceBody = typeof CustomPlaceBody.infer;
