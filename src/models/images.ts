import { sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { ulid } from "ulidx";
import type { Db } from "../db/client";
import type { UserId } from "../env";
import { isJpeg, stripJpegMetadata } from "../lib/exif";
import { BAD_REQUEST, NOT_FOUND } from "../lib/http";
import {
	type ImageUploadBody,
	MAX_IMAGE_BYTES,
	type VisitImage,
} from "../schemas/images";

/** 写真は本人しか見ないので、共有キャッシュには置かせず、手元にだけ 1 日置く */
const CACHE_CONTROL = "private, max-age=86400";

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
	db.get<ImageRow>(sql`
    SELECT i.id, i.visit_id AS visitId, i.r2_key AS r2Key, i.caption
    FROM visit_images i JOIN visits v ON v.id = i.visit_id
    WHERE i.id = ${imageId} AND v.user_id = ${userId}`);

/** 訪問ごとの写真 (並び順)。訪問の一覧に添える */
export const imagesOfVisits = async (
	db: Db,
	visitIds: string[],
): Promise<Map<string, VisitImage[]>> => {
	const byVisit = new Map<string, VisitImage[]>();
	if (visitIds.length === 0) {
		return byVisit;
	}
	const rows = await db.all<ImageRow>(sql`
    SELECT id, visit_id AS visitId, r2_key AS r2Key, caption FROM visit_images
    WHERE visit_id IN (${sql.join(
			visitIds.map((id) => sql`${id}`),
			sql`, `,
		)})
    ORDER BY seq, created_at`);
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
	const visit = await db.get(
		sql`SELECT id FROM visits WHERE id = ${visitId} AND user_id = ${userId}`,
	);
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
	await db.run(sql`
    INSERT INTO visit_images (id, visit_id, r2_key, caption, seq)
    VALUES (${id}, ${visitId}, ${key}, ${body.caption ?? null},
      (SELECT count(*) FROM visit_images WHERE visit_id = ${visitId}))`);
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
	await db.run(sql`DELETE FROM visit_images WHERE id = ${imageId}`);
	return { id: imageId };
};
