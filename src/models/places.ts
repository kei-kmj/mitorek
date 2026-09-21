import { type SQL, sql } from "drizzle-orm";
import { ulid } from "ulidx";
import type { Db } from "../db/client";
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
const squashSql = (column: SQL): SQL =>
	IGNORED_CHARS.reduce<SQL>(
		(expr, c) => sql`replace(${expr}, ${c}, '')`,
		column,
	);

/**
 * 表記ゆれを吸収した部分一致: 検索語のカタカナ版・ひらがな版のどれかが、どれかの列に含まれる。
 * 空の列 (NULL) は一致しない
 */
const matches = (columns: SQL[], q: string): SQL =>
	sql`(${sql.join(
		columns.flatMap((column) =>
			queryVariants(q).map(
				(v) =>
					sql`${squashSql(column)} LIKE ${likePattern(v, "%")} ESCAPE '\\'`,
			),
		),
		sql` OR `,
	)})`;

/** 前方一致: 検索語の変形のどれかで始まる */
const matchesPrefix = (column: SQL, q: string): SQL =>
	sql.join(
		queryVariants(q).map(
			(v) => sql`${squashSql(column)} LIKE ${likePattern(v, "")} ESCAPE '\\'`,
		),
		sql` OR `,
	);

/** 前方一致を先に、短い名前を先に並べる式 (表記ゆれを吸収した形で比べる) */
const rank = (column: SQL, q: string) =>
	sql`(${matchesPrefix(column, q)}) DESC, length(${column})`;

/**
 * 名前で地点を探す: スポット (ふりがなでも)・駅・自分の登録地点。
 * ひらがな・カタカナの違いと、長音・空白・中黒の有無は区別しない (ナガシマスパランド → ナガシマスパーランド)。
 * スポットは県名、駅は県名と路線を補足に付けて、同名を見分けられるようにする
 */
export const searchPlaces = async (
	db: Db,
	userId: UserId,
	q: string,
): Promise<PlaceCandidate[]> => {
	const spots = await db.all<PlaceCandidate>(sql`
    SELECT 'spot' AS type, s.id, s.name, s.lat, s.lng, s.collection_id AS collectionId,
      NULL AS kind, p.name AS detail
    FROM spots s LEFT JOIN prefectures p ON p.code = s.prefecture_code
    WHERE s.retired_at IS NULL
      AND ${matches([sql`s.name`, sql`s.name_kana`], q)}
    ORDER BY ${rank(sql`s.name`, q)} LIMIT ${LIMIT}`);
	const stations = await db.all<PlaceCandidate>(sql`
    SELECT 'station' AS type, st.id, st.name, st.lat, st.lng, NULL AS collectionId, NULL AS kind,
      p.name || COALESCE(' ' || (SELECT group_concat(l.name, '・') FROM station_lines sl
        JOIN lines l ON l.id = sl.line_id WHERE sl.station_id = st.id), '') AS detail
    FROM stations st LEFT JOIN prefectures p ON p.code = st.prefecture_code
    WHERE ${matches([sql`st.name`], stationQuery(q))}
    ORDER BY ${rank(sql`st.name`, stationQuery(q))} LIMIT ${LIMIT}`);
	const mine = await db.all<PlaceCandidate>(sql`
    SELECT 'custom' AS type, id, name, lat, lng, NULL AS collectionId, kind, memo AS detail
    FROM custom_places
    WHERE user_id = ${userId} AND ${matches([sql`name`], q)}
    ORDER BY ${rank(sql`name`, q)} LIMIT ${LIMIT}`);
	return [...mine, ...spots, ...stations];
};

/** 自分で使う地点 (ホテル・駐車場など) を登録する */
export const createCustomPlace = async (
	db: Db,
	userId: UserId,
	body: CustomPlaceBody,
): Promise<PlaceCandidate> => {
	const id = ulid();
	await db.run(sql`
    INSERT INTO custom_places (id, user_id, kind, name, lat, lng, memo)
    VALUES (${id}, ${userId}, ${body.kind}, ${body.name}, ${body.lat}, ${body.lng}, ${body.memo ?? null})`);
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
	const rows = await db.all<{ code: string; name: string }>(
		sql`SELECT code, name FROM prefectures`,
	);
	const names = new Map(rows.map((r) => [r.code, r.name]));
	return (code) => names.get(code);
};
