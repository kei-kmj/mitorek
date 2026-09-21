import { type } from "arktype";
import {
	BoundingBox,
	DEFAULT_RADIUS_M,
	Latitude,
	Longitude,
	RadiusM,
} from "./geo";

// クエリ文字列は string で来るので、morph で意味のある型に変えてからハンドラに渡す
const Flag = type("'1' | '0' | 'true' | 'false'").pipe(
	(v) => v === "1" || v === "true",
);

// ---- 出力 ----
export const Spot = type({
	collectionId: "string",
	groupKey: "string | null",
	id: "string",
	lat: Latitude,
	lng: Longitude,
	name: "string",
	note: "string | null",
	officialUrl: "string | null",
	prefectureCode: "string | null",
	retired: "boolean",
	reward: "string | null",
	visited: "boolean",
});
export type Spot = typeof Spot.infer;

export const NearbySpot = Spot.and({ distanceM: "number >= 0" });
export type NearbySpot = typeof NearbySpot.infer;

// ---- 入力 ----
/** GET /api/spots : 一覧。矩形と属性で絞る */
export const SpotListQuery = type({
	"bbox?": BoundingBox,
	"collection?": "string",
	"pref?": "string",
	"unvisited?": Flag,
});
export type SpotListQuery = typeof SpotListQuery.infer;

/** GET /api/spots/nearby : 近傍の未訪問。中心は必須、半径は既定あり */
export const NearbyQuery = type({
	lat: type("string.numeric.parse").to(Latitude),
	lng: type("string.numeric.parse").to(Longitude),
	"r?": type("string.numeric.parse").to(RadiusM),
}).pipe((q) => ({
	center: { lat: q.lat, lng: q.lng },
	radiusM: q.r ?? DEFAULT_RADIUS_M,
}));
export type NearbyQuery = typeof NearbyQuery.infer;

export const SpotIdParam = type({ id: "string" });
export type SpotIdParam = typeof SpotIdParam.infer;
