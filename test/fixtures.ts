import { env } from "cloudflare:workers";
import { createDb, type Db } from "../src/db/client";
import { customPlaces } from "../src/db/schema/itinerary";
import {
	collections,
	games,
	prefectures,
	regions,
	spots,
} from "../src/db/schema/master";
import {
	lines,
	railOperators,
	stationLines,
	stations,
} from "../src/db/schema/rail";
import { users } from "../src/db/schema/users";
import { visits } from "../src/db/schema/visits";

/**
 * テストの準備データ。各テストは空の D1 から始まる (setup.ts) ので、beforeEach で seedFixture を入れる。
 * 全テストで同じデータを使う。テストの条件 (訪問済みなど) は、そのテストの中で足す
 */

/** API の利用者 (DEV_USER_ID) と、他人 */
export const ME = env.DEV_USER_ID;
export const OTHER = "01OTHERUSER0000000000000000";

/** 姫路駅の位置。近い順に 好古園 (約 1.2km) → 姫路城 (約 1.4km)。東京は遠方の対照 */
export const HIMEJI_STATION = { lat: 34.8267, lng: 134.6906 };

const spot = (
	id: string,
	name: string,
	[lat, lng]: [number, number],
	extra: Partial<typeof spots.$inferInsert> = {},
) => ({
	collectionId: "dqw.castle",
	id,
	lat,
	lng,
	name,
	prefectureCode: "JP-28",
	...extra,
});

// 取り込み元は "test"、元コードは行ごとに連番を振る
const line = (
	id: string,
	name: string,
	operatorId: string | null,
	n: number,
) => ({
	countryCode: "JP",
	id,
	name,
	operatorId,
	source: "test",
	sourceCode: String(n),
});
const station = (
	id: string,
	name: string,
	[lat, lng]: [number, number],
	n: number,
) => ({
	id,
	lat,
	lng,
	name,
	prefectureCode: "JP-28",
	source: "test",
	sourceCode: String(n),
});

/** 自分と他人。ゲーム・地方・県 (兵庫・東京)・コレクション 2 つ */
const masterRows = (db: Db) =>
	[
		db.insert(users).values([
			{ email: "me@example.com", id: ME },
			{ email: "other@example.com", id: OTHER },
		]),
		db.insert(games).values({ id: "dqw", name: "DQW" }),
		db.insert(regions).values([
			{ id: "kinki", name: "近畿" },
			{ id: "kanto", name: "関東" },
		]),
		db.insert(prefectures).values([
			{
				code: "JP-28",
				countryCode: "JP",
				name: "兵庫県",
				regionId: "kinki",
				sortOrder: 28,
			},
			{
				code: "JP-13",
				countryCode: "JP",
				name: "東京都",
				regionId: "kanto",
				sortOrder: 13,
			},
		]),
		db.insert(collections).values([
			{ gameId: "dqw", id: "dqw.castle", name: "城" },
			{ gameId: "dqw", id: "dqw.souvenir", name: "お土産" },
		]),
	] as const;

/** スポット: 姫路城・好古園 (お土産)・江戸城 (東京)・廃止スポット。自分のホテルと他人の場所 */
const placeRows = (db: Db) =>
	[
		db.insert(spots).values([
			spot("castle", "姫路城", [34.8394, 134.6939]),
			spot("garden", "好古園", [34.8378, 134.6899], {
				collectionId: "dqw.souvenir",
			}),
			spot("tokyo", "江戸城", [35.6852, 139.7528], { prefectureCode: "JP-13" }),
			spot("retired", "廃止スポット", [34.827, 134.691], {
				retiredAt: "2025-04-30",
			}),
		]),
		db.insert(customPlaces).values([
			{
				id: "hotel",
				kind: "hotel",
				lat: 34.83,
				lng: 134.69,
				name: "駅前ホテル",
				userId: ME,
			},
			{ id: "others", lat: 35, lng: 135, name: "他人の場所", userId: OTHER },
		]),
	] as const;

/** 駅: 姫路・亀山 (路線付き)・大阪 (姫路の矩形の外)。事業者の無い路線を 1 つ含む */
const railRows = (db: Db) =>
	[
		db.insert(railOperators).values([
			{ id: "jrw", name: "西日本旅客鉄道", source: "test", sourceCode: "1" },
			{ id: "sanyo", name: "山陽電気鉄道", source: "test", sourceCode: "2" },
		]),
		db
			.insert(lines)
			.values([
				line("sanyo-line", "山陽線", "jrw", 1),
				line("bantan", "播但線", "jrw", 2),
				line("honsen", "本線", "sanyo", 3),
				line("unknown-op", "謎線", null, 4),
			]),
		db
			.insert(stations)
			.values([
				station("himeji", "姫路", [34.827_15, 134.690_638], 1),
				station("kameyama", "亀山", [34.810_655, 134.676_75], 2),
				station("osaka", "大阪", [34.702_519, 135.494_663], 3),
			]),
		db.insert(stationLines).values([
			{ lineId: "sanyo-line", stationId: "himeji" },
			{ lineId: "bantan", stationId: "himeji" },
			{ lineId: "honsen", stationId: "kameyama" },
			{ lineId: "unknown-op", stationId: "kameyama" },
			{ lineId: "sanyo-line", stationId: "osaka" },
		]),
	] as const;

export const seedFixture = async () => {
	const db = createDb(env.mitorek_db);
	await db.batch([...masterRows(db), ...placeRows(db), ...railRows(db)]);
};

/** 自分は姫路城に、他人は好古園に訪問済みにする (「訪問済み」が利用者ごとかを確かめる用) */
export const insertSpotVisits = () =>
	createDb(env.mitorek_db)
		.insert(visits)
		.values([
			{ id: "v1", spotId: "castle", userId: ME },
			{ id: "v2", spotId: "garden", userId: OTHER },
		]);

/** 他人の姫路城の訪問 (id: others)。自分からは見えず、触れないことを確かめる用 */
export const insertOthersVisit = () =>
	createDb(env.mitorek_db)
		.insert(visits)
		.values({ id: "others", spotId: "castle", userId: OTHER });

export const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
