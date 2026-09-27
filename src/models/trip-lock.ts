import { and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { HTTPException } from "hono/http-exception";
import type { Db } from "../db/client";
import { trips } from "../db/schema/itinerary";
import type { UserId } from "../env";
import { CONFLICT, NOT_FOUND } from "../lib/http";

/** updatedAt が古いとき (409) の文言 */
const STALE_MESSAGE =
	"このおでかけプランは別の画面で更新されています。読み込み直してください";

/** 受け取った updatedAt が古い (または他人の旅程) ときに bump が起こすエラー */
const STALE_ERROR = "NOT NULL constraint failed: trips.updated_at";

/** エラーの説明を cause までたどって集める (drizzle は D1 のエラーを包んで投げる) */
const messagesOf = (err: unknown): string => {
	if (!(err instanceof Error)) {
		return "";
	}
	return `${err.message}\n${messagesOf(err.cause)}`;
};

/**
 * 旅程の楽観ロック (docs/design.md F9)。
 * D1 には対話型トランザクションが無いが、batch は 1 つのトランザクションで、どれかの文が
 * 失敗すると全体が取り消される。そこで batch の先頭で updated_at を進め (bump)、
 * updated_at が受け取った値でなければ NULL を入れて NOT NULL 制約で失敗させる。
 * 後に続く変更の文には条件を付けなくてよい
 */
export interface Lock {
	tripId: string;
	updatedAt: string;
	userId: UserId;
}

/** 自分の旅程か。他人の旅程と存在しない旅程は区別しない (どちらも 404) */
export const assertOwnTrip = async (
	db: Db,
	userId: UserId,
	tripId: string,
): Promise<void> => {
	const row = await db
		.select({ id: trips.id })
		.from(trips)
		.where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
		.get();
	if (!row) {
		throw new HTTPException(NOT_FOUND, { message: "trip not found" });
	}
};

/**
 * updated_at を進めてから変更の文を流す。
 * updated_at はミリ秒まで持たせる (秒だと 1 秒以内の 2 回の更新を区別できない)
 */
export const runLocked = async (
	db: Db,
	{ tripId, updatedAt, userId }: Lock,
	statements: BatchItem<"sqlite">[],
): Promise<void> => {
	await assertOwnTrip(db, userId, tripId);
	// 自分の旅程で updated_at が同じときだけ進める。それ以外は NULL にして batch ごと失敗させる
	const bump = db
		.update(trips)
		.set({
			updatedAt: sql`CASE WHEN ${trips.userId} = ${userId} AND ${trips.updatedAt} = ${updatedAt}
        THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END`,
		})
		.where(eq(trips.id, tripId));
	try {
		const [bumped] = await db.batch([bump, ...statements]);
		// 確かめた後で旅程が消された
		if (bumped.meta.changes === 0) {
			throw new HTTPException(CONFLICT, { message: STALE_MESSAGE });
		}
	} catch (err) {
		if (messagesOf(err).includes(STALE_ERROR)) {
			throw new HTTPException(CONFLICT, { cause: err, message: STALE_MESSAGE });
		}
		throw err;
	}
};

export { STALE_MESSAGE };
