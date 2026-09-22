import { type } from "arktype";
import { Latitude, Longitude } from "./geo";
import { VisitImage } from "./images";

// ---- 出力 ----
export const Visit = type({
	createdAt: "string",
	id: "string",
	/** この訪問の写真 (並び順) */
	images: VisitImage.array(),
	/** 記録したときの端末の位置 (任意) */
	lat: Latitude.or("null"),
	lng: Longitude.or("null"),
	memo: "string | null",
	spotId: "string",
	/**
	 * いつ行ったか。地図の「行った」は UTC の日時 (2026-09-21T05:30:00.000Z)、
	 * 振り返りは日付だけ (2026-09-21)。過去分で分からなければ null
	 */
	visitedAt: "string | null",
});
export type Visit = typeof Visit.infer;

// ---- 入力 ----
/** POST /api/visits : いま行った (日時はサーバーの現在時刻) */
export const VisitCreateBody = type({
	"lat?": Latitude,
	"lng?": Longitude,
	spotId: "string",
});
export type VisitCreateBody = typeof VisitCreateBody.infer;

/** GET /api/visits?spotId= : そのスポットの自分の訪問 */
export const VisitListQuery = type({ spotId: "string" });
export type VisitListQuery = typeof VisitListQuery.infer;

export const VisitIdParam = type({ id: "string" });
export type VisitIdParam = typeof VisitIdParam.infer;
