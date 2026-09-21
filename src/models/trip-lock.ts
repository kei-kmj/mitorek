import { type SQL, sql } from "drizzle-orm";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
import { HTTPException } from "hono/http-exception";
import type { Db } from "../db/client";
import type { UserId } from "../env";
import { CONFLICT, NOT_FOUND } from "../lib/http";

const dialect = new SQLiteAsyncDialect();

/** updatedAt が古いとき (409) の文言 */
const STALE_MESSAGE =
	"このおでかけプランは別の画面で更新されています。読み込み直してください";

/**
 * 旅程の楽観ロック (docs/design.md F9)。
 * D1 には対話型トランザクションが無いので、1 つの batch の中で
 *   1. 変更する文はすべて「旅程の updated_at が受け取った値のまま」を条件にする (guard)
 *   2. 最後に updated_at を進める (bump)
 * とし、bump が 0 行なら「誰かが先に更新した」とみなす。条件が偽なら 1 の文も何も変えない
 */
export interface Lock {
	tripId: string;
	updatedAt: string;
	userId: UserId;
}

/** 変更する文の WHERE に足す条件 */
export const guard = ({ tripId, updatedAt, userId }: Lock): SQL =>
	sql`EXISTS (SELECT 1 FROM trips WHERE id = ${tripId} AND user_id = ${userId} AND updated_at = ${updatedAt})`;

/** 自分の旅程か。他人の旅程と存在しない旅程は区別しない (どちらも 404) */
export const assertOwnTrip = async (
	db: Db,
	userId: UserId,
	tripId: string,
): Promise<void> => {
	const row = await db.get<{ id: string }>(
		sql`SELECT id FROM trips WHERE id = ${tripId} AND user_id = ${userId}`,
	);
	if (!row) {
		throw new HTTPException(NOT_FOUND, { message: "trip not found" });
	}
};

/**
 * drizzle の sql を D1 の prepared statement にする。
 * drizzle の batch は db.run(sql) を受け付けない (bind で落ちる) ので、D1 の batch に直接渡す
 */
export const stmt = (db: Db, query: SQL): D1PreparedStatement => {
	const { params, sql: text } = dialect.sqlToQuery(query);
	return db.$client.prepare(text).bind(...params);
};

/**
 * guard 付きの文を batch で流し、最後に updated_at を進める。
 * updated_at はミリ秒まで持たせる (秒だと 1 秒以内の 2 回の更新を区別できない)
 */
export const runLocked = async (
	db: Db,
	lock: Lock,
	statements: D1PreparedStatement[],
): Promise<void> => {
	await assertOwnTrip(db, lock.userId, lock.tripId);
	const bump = stmt(
		db,
		sql`UPDATE trips SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ${lock.tripId} AND user_id = ${lock.userId} AND updated_at = ${lock.updatedAt}`,
	);
	const results = await db.$client.batch([...statements, bump]);
	if (results.at(-1)?.meta.changes === 0) {
		throw new HTTPException(CONFLICT, { message: STALE_MESSAGE });
	}
};

export { STALE_MESSAGE };
