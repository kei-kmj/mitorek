import {
	and,
	desc,
	eq,
	isNull,
	or,
	type SQL,
	type SQLWrapper,
	sql,
} from "drizzle-orm";
import { ulid } from "ulidx";
import { type Db, qb } from "../db/client";
import { customPlaces } from "../db/schema/itinerary";
import { prefectures, spots } from "../db/schema/master";
import { lines, stationLines, stations } from "../db/schema/rail";
import type { UserId } from "../env";
import { IGNORED_CHARS, queryVariants } from "../lib/kana";
import type { CustomPlaceBody, PlaceCandidate } from "../schemas/places";

/** 種類ごとの候補の上限 */
const LIMIT = 10;
const TRAILING_STATION = /駅$/u;

/** LIKE の % と _ を文字として扱う (ESCAPE '\' と組で使う) */
const likePattern = (q: string, prefix: "" | "%") =>
	`${prefix}${q.replaceAll(/[\\%_]/gu, (c) => `\\${c}`)}%`;

/**
 * 駅は「松本」のように「駅」を付けずに登録されているので、「松本駅」と打たれたら末尾の「駅」を外す。
 * スポットには「京都駅」のような名前があるので、スポットの検索には元の入力を使う
 */
const stationQuery = (q: string) => {
	const stripped = q.replace(TRAILING_STATION, "");
	if (stripped.length === 0) {
		return q;
	}
	return stripped;
};

/** 列から、表記ゆれとして無視する文字 (長音・空白・中黒) を落とす式。lib/kana.ts の squash と同じ */
const squashSql = (column: SQLWrapper): SQL =>
	IGNORED_CHARS.reduce<SQL>(
		(expr, c) => sql`replace(${expr}, ${c}, '')`,
		sql`${column}`,
	);

/**
 * 表記ゆれを吸収した部分一致: 検索語のカタカナ版・ひらがな版のどれかが、どれかの列に含まれる。
 * 空の列 (NULL) は一致しない
 */
const matches = (columns: SQLWrapper[], q: string): SQL | undefined =>
	or(
		...columns.flatMap((column) =>
			queryVariants(q).map(
				(v) =>
					sql`${squashSql(column)} LIKE ${likePattern(v, "%")} ESCAPE '\\'`,
			),
		),
	);

/** 前方一致: 検索語の変形のどれかで始まる */
const matchesPrefix = (column: SQLWrapper, q: string): SQL | undefined =>
	or(
		...queryVariants(q).map(
			(v) => sql`${squashSql(column)} LIKE ${likePattern(v, "")} ESCAPE '\\'`,
		),
	);

/** 前方一致を先に、短い名前を先に並べる式 (表記ゆれを吸収した形で比べる) */
const rank = (column: SQLWrapper, q: string): SQL[] => [
	desc(sql`(${matchesPrefix(column, q)})`),
	sql`length(${column})`,
];

/** 駅を通る路線名を「・」でつないだもの */
const stationLineNames = qb
	.select({ names: sql`group_concat(${lines.name}, '・')` })
	.from(stationLines)
	.innerJoin(lines, eq(lines.id, stationLines.lineId))
	.where(eq(stationLines.stationId, stations.id));

const searchSpots = (db: Db, q: string) =>
	db
		.select({
			collectionId: spots.collectionId,
			detail: prefectures.name,
			id: spots.id,
			kind: sql<null>`NULL`,
			lat: spots.lat,
			lng: spots.lng,
			name: spots.name,
			type: sql<"spot">`'spot'`,
		})
		.from(spots)
		.leftJoin(prefectures, eq(prefectures.code, spots.prefectureCode))
		.where(
			and(isNull(spots.retiredAt), matches([spots.name, spots.nameKana], q)),
		)
		.orderBy(...rank(spots.name, q))
		.limit(LIMIT);

const searchStations = (db: Db, q: string) =>
	db
		.select({
			collectionId: sql<null>`NULL`,
			detail: sql<
				string | null
			>`${prefectures.name} || COALESCE(' ' || (${stationLineNames}), '')`,
			id: stations.id,
			kind: sql<null>`NULL`,
			lat: stations.lat,
			lng: stations.lng,
			name: stations.name,
			type: sql<"station">`'station'`,
		})
		.from(stations)
		.leftJoin(prefectures, eq(prefectures.code, stations.prefectureCode))
		.where(matches([stations.name], stationQuery(q)))
		.orderBy(...rank(stations.name, stationQuery(q)))
		.limit(LIMIT);

const searchMine = (db: Db, userId: UserId, q: string) =>
	db
		.select({
			collectionId: sql<null>`NULL`,
			detail: customPlaces.memo,
			id: customPlaces.id,
			kind: customPlaces.kind,
			lat: customPlaces.lat,
			lng: customPlaces.lng,
			name: customPlaces.name,
			type: sql<"custom">`'custom'`,
		})
		.from(customPlaces)
		.where(
			and(eq(customPlaces.userId, userId), matches([customPlaces.name], q)),
		)
		.orderBy(...rank(customPlaces.name, q))
		.limit(LIMIT);

/**
 * 名前で地点を探す: スポット (ふりがなでも)・駅・自分の登録地点。
 * ひらがな・カタカナの違いと、長音・空白・中黒の有無は区別しない (ナガシマスパランド → ナガシマスパーランド)。
 * スポットは県名、駅は県名と路線を補足に付けて、同名を見分けられるようにする
 */
export const searchPlaces = async (
	db: Db,
	userId: UserId,
	q: string,
): Promise<PlaceCandidate[]> => [
	...(await searchMine(db, userId, q)),
	...(await searchSpots(db, q)),
	...(await searchStations(db, q)),
];

/** 自分で使う地点 (ホテル・駐車場など) を登録する */
export const createCustomPlace = async (
	db: Db,
	userId: UserId,
	body: CustomPlaceBody,
): Promise<PlaceCandidate> => {
	const id = ulid();
	await db.insert(customPlaces).values({
		id,
		kind: body.kind,
		lat: body.lat,
		lng: body.lng,
		memo: body.memo ?? null,
		name: body.name,
		userId,
	});
	return {
		collectionId: null,
		detail: body.memo ?? null,
		id,
		kind: body.kind,
		lat: body.lat,
		lng: body.lng,
		name: body.name,
		type: "custom",
	};
};

/** 県コード (JP-20) → 県名 (長野県) の表。住所検索の補足に使う */
export const prefectureNames = async (
	db: Db,
): Promise<(code: string) => string | undefined> => {
	const rows = await db
		.select({ code: prefectures.code, name: prefectures.name })
		.from(prefectures);
	const names = new Map(rows.map((r) => [r.code, r.name]));
	return (code) => names.get(code);
};
