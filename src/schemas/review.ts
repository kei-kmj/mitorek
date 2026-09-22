import { type } from "arktype";
import { IsoDate } from "./trips";
import { Visit } from "./visits";

// ---- 出力 ----
/** 振り返りの 1 行: おでかけプランに入れたスポット 1 つ (その日の立ち寄り) */
export const ReviewItem = type({
	collectionId: "string",
	date: IsoDate,
	name: "string",
	spotId: "string",
	stopId: "string",
	/** その日 (日本時間) に記録済みの訪問。空なら未記録 */
	visits: Visit.array(),
});
export type ReviewItem = typeof ReviewItem.infer;

// ---- 入力 ----
/** POST /api/trips/:id/review : 行ったスポットの立ち寄りを選んで確定する */
export const ReviewConfirmBody = type({ stopIds: "string[]" });
export type ReviewConfirmBody = typeof ReviewConfirmBody.infer;
