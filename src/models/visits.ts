import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { ulid } from "ulidx";
import type { Db } from "../db/client";
import { spots } from "../db/schema/master";
import { visitImages, visits } from "../db/schema/visits";
import type { UserId } from "../env";
import { NOT_FOUND } from "../lib/http";
import type { Visit, VisitCreateBody } from "../schemas/visits";
import { imagesOfVisits } from "./images";

const visitColumns = {
	createdAt: visits.createdAt,
	id: visits.id,
	lat: visits.lat,
	lng: visits.lng,
	memo: visits.memo,
	spotId: visits.spotId,
	visitedAt: visits.visitedAt,
};

/** そのスポットへの自分の訪問 (新しい順)。日付不明 (null) は最後。写真を添える */
export const listVisits = async (
	db: Db,
	userId: UserId,
	spotId: string,
): Promise<Visit[]> => {
	const rows = await db
		.select(visitColumns)
		.from(visits)
		.where(and(eq(visits.userId, userId), eq(visits.spotId, spotId)))
		.orderBy(
			sql`${visits.visitedAt} IS NULL`,
			desc(visits.visitedAt),
			desc(visits.createdAt),
		);
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
	const spot = await db
		.select({ id: spots.id })
		.from(spots)
		.where(and(eq(spots.id, body.spotId), isNull(spots.retiredAt)))
		.get();
	if (!spot) {
		throw new HTTPException(NOT_FOUND, { message: "spot not found" });
	}
	const row = await db
		.insert(visits)
		.values({
			id: ulid(),
			lat: body.lat ?? null,
			lng: body.lng ?? null,
			spotId: body.spotId,
			userId,
			visitedAt: new Date().toISOString(),
		})
		.returning(visitColumns)
		.get();
	return { ...row, images: [] };
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
	const keys = await db
		.select({ key: visitImages.r2Key })
		.from(visitImages)
		.innerJoin(visits, eq(visits.id, visitImages.visitId))
		.where(and(eq(visits.id, visitId), eq(visits.userId, userId)));
	if (keys.length > 0) {
		await bucket.delete(keys.map((k) => k.key));
	}
	const result = await db
		.delete(visits)
		.where(and(eq(visits.id, visitId), eq(visits.userId, userId)));
	if (result.meta.changes === 0) {
		throw new HTTPException(NOT_FOUND, { message: "visit not found" });
	}
	return { id: visitId };
};
