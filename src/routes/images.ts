import { type } from "arktype";
import { Hono } from "hono";
import type { Env } from "../env";
import { CREATED } from "../lib/http";
import { route } from "../lib/route";
import { addImage, deleteImage, imageResponse } from "../models/images";
import { ImageIdParam, ImageUploadBody, VisitImage } from "../schemas/images";
import { VisitIdParam } from "../schemas/visits";

/** 訪問の写真。/api の直下に付ける (/api/visits/:id/images と /api/images/:id) */
const imagesApp = new Hono<Env>();

/** POST /api/visits/:id/images — 写真を足す (multipart/form-data の file、JPEG) */
imagesApp.post(
	"/visits/:id/images",
	...route(
		{
			body: ImageUploadBody,
			bodyFormat: "form",
			param: VisitIdParam,
			response: VisitImage,
			status: CREATED,
			summary: "訪問に写真を足す (位置情報などは消して保存)",
			tags: ["visits"],
		},
		({ body, c, db, param, userId }) =>
			addImage(db, userId, {
				body,
				bucket: c.env.mitorek_images,
				visitId: param.id,
			}),
	),
);

/** GET /api/images/:id — 写真そのもの (本人だけ) */
imagesApp.get(
	"/images/:id",
	...route(
		{
			binary: "image/jpeg",
			param: ImageIdParam,
			summary: "写真を見る",
			tags: ["visits"],
		},
		({ c, db, param, userId }) =>
			imageResponse(db, userId, {
				bucket: c.env.mitorek_images,
				imageId: param.id,
			}),
	),
);

/** DELETE /api/images/:id */
imagesApp.delete(
	"/images/:id",
	...route(
		{
			param: ImageIdParam,
			response: type({ id: "string" }),
			summary: "写真を消す",
			tags: ["visits"],
		},
		({ c, db, param, userId }) =>
			deleteImage(db, userId, {
				bucket: c.env.mitorek_images,
				imageId: param.id,
			}),
	),
);

export { imagesApp };
