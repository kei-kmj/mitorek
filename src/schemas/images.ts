import { type } from "arktype";

/** 1 枚の上限。画面側で長辺 2048px の JPEG に縮めてから送るので、普通は 1MB 前後 */
export const MAX_IMAGE_BYTES = 10_485_760; // 10MB

// ---- 出力 ----
export const VisitImage = type({
	caption: "string | null",
	id: "string",
	/** 表示用の URL (/api/images/:id)。本人しか見られない */
	url: "string",
	visitId: "string",
});
export type VisitImage = typeof VisitImage.infer;

// ---- 入力 ----
/** POST /api/visits/:id/images (multipart/form-data) */
export const ImageUploadBody = type({
	"caption?": "string <= 200",
	file: type.instanceOf(File),
});
export type ImageUploadBody = typeof ImageUploadBody.infer;

export const ImageIdParam = type({ id: "string" });
export type ImageIdParam = typeof ImageIdParam.infer;
