import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { ulid } from "ulidx";
import { type Db, qb } from "../db/client";
import { visitImages, visits } from "../db/schema/visits";
import type { UserId } from "../env";
import { BAD_REQUEST, NOT_FOUND } from "../lib/http";
import { isJpeg, stripJpegMetadata } from "../lib/jpeg-metadata";
import {
	type ImageUploadBody,
	MAX_IMAGE_BYTES,
	type VisitImage,
} from "../schemas/images";

/** 写真は本人しか見ないので、共有キャッシュには置かせず、手元にだけ 1 日置く */
const CACHE_CONTROL = "private, max-age=86400";

const imageColumns = {
	caption: visitImages.caption,
	id: visitImages.id,
	r2Key: visitImages.r2Key,
	visitId: visitImages.visitId,
};

interface ImageRow {
	caption: string | null;
	id: string;
	r2Key: string;
	visitId: string;
}

const toImage = (r: ImageRow): VisitImage => ({
	caption: r.caption,
	id: r.id,
	url: `/api/images/${r.id}`,
	visitId: r.visitId,
});

const notFound = (what: string) =>
	new HTTPException(NOT_FOUND, { message: `${what} not found` });

/** 自分の写真 (訪問経由で持ち主を確かめる) */
const findOwnImage = (db: Db, userId: UserId, imageId: string) =>
	db
		.select(imageColumns)
		.from(visitImages)
		.innerJoin(visits, eq(visits.id, visitImages.visitId))
		.where(and(eq(visitImages.id, imageId), eq(visits.userId, userId)))
		.get();

/** 訪問ごとの写真 (並び順)。訪問の一覧に添える */
export const imagesOfVisits = async (
	db: Db,
	visitIds: string[],
): Promise<Map<string, VisitImage[]>> => {
	const byVisit = new Map<string, VisitImage[]>();
	if (visitIds.length === 0) {
		return byVisit;
	}
	const rows = await db
		.select(imageColumns)
		.from(visitImages)
		.where(inArray(visitImages.visitId, visitIds))
		.orderBy(asc(visitImages.seq), asc(visitImages.createdAt));
	for (const r of rows) {
		byVisit.set(r.visitId, [...(byVisit.get(r.visitId) ?? []), toImage(r)]);
	}
	return byVisit;
};

/** 写真を足す: JPEG だけ受け、メタデータ (位置情報など) を落として R2 に置く */
export const addImage = async (
	db: Db,
	userId: UserId,
	{
		body,
		bucket,
		visitId,
	}: { body: ImageUploadBody; bucket: R2Bucket; visitId: string },
): Promise<VisitImage> => {
	const visit = await db
		.select({ id: visits.id })
		.from(visits)
		.where(and(eq(visits.id, visitId), eq(visits.userId, userId)))
		.get();
	if (!visit) {
		throw notFound("visit");
	}
	const bytes = new Uint8Array(await body.file.arrayBuffer());
	if (bytes.length > MAX_IMAGE_BYTES || !isJpeg(bytes)) {
		throw new HTTPException(BAD_REQUEST, {
			message: "JPEG で 10MB までの写真を送ってください",
		});
	}
	const id = ulid();
	const key = `visits/${userId}/${visitId}/${id}.jpg`;
	await bucket.put(key, stripJpegMetadata(bytes), {
		httpMetadata: { contentType: "image/jpeg" },
	});
	// 並び順は末尾 (今ある枚数)
	const seq = qb
		.select({ n: count() })
		.from(visitImages)
		.where(eq(visitImages.visitId, visitId));
	await db.insert(visitImages).values({
		caption: body.caption ?? null,
		id,
		r2Key: key,
		seq: sql`(${seq})`,
		visitId,
	});
	return toImage({ caption: body.caption ?? null, id, r2Key: key, visitId });
};

/** 写真そのもの。本人以外・無い写真は 404 */
export const imageResponse = async (
	db: Db,
	userId: UserId,
	{ bucket, imageId }: { bucket: R2Bucket; imageId: string },
): Promise<Response> => {
	const image = await findOwnImage(db, userId, imageId);
	const object = image && (await bucket.get(image.r2Key));
	if (!object) {
		throw notFound("image");
	}
	return new Response(object.body, {
		headers: {
			"cache-control": CACHE_CONTROL,
			"content-type": "image/jpeg",
		},
	});
};

/** 写真を消す (R2 と DB の両方) */
export const deleteImage = async (
	db: Db,
	userId: UserId,
	{ bucket, imageId }: { bucket: R2Bucket; imageId: string },
): Promise<{ id: string }> => {
	const image = await findOwnImage(db, userId, imageId);
	if (!image) {
		throw notFound("image");
	}
	await bucket.delete(image.r2Key);
	await db.delete(visitImages).where(eq(visitImages.id, imageId));
	return { id: imageId };
};
