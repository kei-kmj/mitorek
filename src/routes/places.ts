import { Hono } from "hono";
import type { Env } from "../env";
import { geocode } from "../lib/geocode";
import { CREATED } from "../lib/http";
import { route } from "../lib/route";
import {
	createCustomPlace,
	prefectureNames,
	searchPlaces,
} from "../models/places";
import {
	CustomPlaceBody,
	GeocodeResult,
	PlaceCandidate,
	PlaceSearchQuery,
} from "../schemas/places";

const placesApp = new Hono<Env>();

/** GET /api/places/search?q= — 旅程に足す地点を名前で探す */
placesApp.get(
	"/search",
	...route(
		{
			query: PlaceSearchQuery,
			response: PlaceCandidate.array(),
			summary: "地点を名前で探す (スポット・駅・自分の登録地点)",
			tags: ["places"],
		},
		({ db, query, userId }) => searchPlaces(db, userId, query.q),
	),
);

/** GET /api/places/geocode?q= — 住所・施設名から座標の候補を引く (国土地理院・Nominatim)。登録はしない */
placesApp.get(
	"/geocode",
	...route(
		{
			query: PlaceSearchQuery,
			response: GeocodeResult.array(),
			summary:
				"住所・施設名から座標を探す (国土地理院・OpenStreetMap Nominatim)",
			tags: ["places"],
		},
		async ({ db, query }) => geocode(query.q, await prefectureNames(db)),
	),
);

/** POST /api/places — ホテル・駐車場などを自分の地点として登録する */
placesApp.post(
	"/",
	...route(
		{
			body: CustomPlaceBody,
			response: PlaceCandidate,
			status: CREATED,
			summary: "自分の地点を登録する",
			tags: ["places"],
		},
		({ body, db, userId }) => createCustomPlace(db, userId, body),
	),
);

export { placesApp };
