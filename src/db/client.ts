import { drizzle } from "drizzle-orm/d1";
import {
	customPlaces,
	days,
	legs,
	links,
	stops,
	trips,
} from "./schema/itinerary";
import {
	collections,
	games,
	prefectures,
	regions,
	spots,
} from "./schema/master";
import {
	lines,
	railCategories,
	railOperators,
	spotStations,
	stationLines,
	stations,
} from "./schema/rail";
import { users } from "./schema/users";
import { visitImages, visits } from "./schema/visits";

/**
 * リレーショナルクエリ用のスキーマ一式。
 * バレルファイルも名前空間 import も lint で禁じているため、ここで明示的に束ねる。
 */
export const schema = {
	collections,
	customPlaces,
	days,
	games,
	legs,
	lines,
	links,
	prefectures,
	railCategories,
	railOperators,
	regions,
	spotStations,
	spots,
	stationLines,
	stations,
	stops,
	trips,
	users,
	visitImages,
	visits,
};

/** リクエストごとに D1 バインディングから drizzle クライアントを作る */
export const createDb = (d1: D1Database) => drizzle(d1, { schema });

export type Db = ReturnType<typeof createDb>;
