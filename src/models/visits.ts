import { sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { ulid } from "ulidx";
import type { Db } from "../db/client";
import type { UserId } from "../env";
import { NOT_FOUND } from "../lib/http";
import type { Visit, VisitCreateBody } from "../schemas/visits";
import { imagesOfVisits } from "./images";

const visitColumns = sql`id, spot_id AS spotId, visited_at AS visitedAt, lat, lng, memo,
  created_at AS createdAt`;

type VisitRow = Omit<Visit, "images">;

/** そのスポットへの自分の訪問 (新しい順)。日付不明 (null) は最後。写真を添える */
export const listVisits = async (
	db: Db,
	userId: UserId,
	spotId: string,
): Promise<Visit[]> => {
	const rows = await db.all<VisitRow>(sql`
    SELECT ${visitColumns} FROM visits
    WHERE user_id = ${userId} AND spot_id = ${spotId}
    ORDER BY visited_at IS NULL, visited_at DESC, created_at DESC`);
	const images = await imagesOfVisits(
		db,
		rows.map((r) => r.id),
	);
	return rows.map((r) => ({ ...r, images: images.get(r.id) ?? [] }));
};

/** いま行った。日時はサーバーの現在時刻 (UTC)。座標は端末が許せば */
export const createVisit = async (
	db: Db,
	userId: UserId,
	body: VisitCreateBody,
): Promise<Visit> => {
	const spot = await db.get(
		sql`SELECT id FROM spots WHERE id = ${body.spotId} AND retired_at IS NULL`,
	);
	if (!spot) {
		throw new HTTPException(NOT_FOUND, { message: "spot not found" });
	}
	const id = ulid();
	const row = await db.get<VisitRow>(sql`
    INSERT INTO visits (id, user_id, spot_id, visited_at, lat, lng)
    VALUES (${id}, ${userId}, ${body.spotId}, ${new Date().toISOString()},
      ${body.lat ?? null}, ${body.lng ?? null})
    RETURNING ${visitColumns}`);
	return { ...(row as VisitRow), images: [] };
};

/**
 * 訪問の取り消し。他人の訪問・無い訪問はどちらも 404。
 * 写真の行は cascade で消えるが R2 の実体は残るので、先に消す
 */
export const deleteVisit = async (
	db: Db,
	userId: UserId,
	{ bucket, visitId }: { bucket: R2Bucket; visitId: string },
): Promise<{ id: string }> => {
	const keys = await db.all<{ key: string }>(sql`
    SELECT i.r2_key AS key FROM visit_images i JOIN visits v ON v.id = i.visit_id
    WHERE v.id = ${visitId} AND v.user_id = ${userId}`);
	if (keys.length > 0) {
		await bucket.delete(keys.map((k) => k.key));
	}
	const result = await db.run(
		sql`DELETE FROM visits WHERE id = ${visitId} AND user_id = ${userId}`,
	);
	if (result.meta.changes === 0) {
		throw new HTTPException(NOT_FOUND, { message: "visit not found" });
	}
	return { id: visitId };
};
