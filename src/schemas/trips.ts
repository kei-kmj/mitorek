import { type } from "arktype";
import { legModes, tripStatuses } from "../db/schema/itinerary";
import { periodProblem } from "../lib/dates";
import { Latitude, Longitude } from "./geo";

const HttpUrl = type(/^https?:\/\/\S+$/u);
/** 楽観ロック用。GET で受け取った updatedAt をそのまま送り返す */
const UpdatedAt = type("string > 0");
const Title = type("0 < string <= 100");
const Memo = type("string <= 2000 | null");

/** 1 つの旅程に作れる日数の上限。期間の打ち間違いで大量の日ができないように */
export const MAX_TRIP_DAYS = 31;

// ---- 値 ----
/** YYYY-MM-DD。形だけでなく実在する日付か (2026-02-30 を弾く) まで確かめる */
export const IsoDate = type(/^\d{4}-\d{2}-\d{2}$/u).narrow(
	(s, ctx) =>
		new Date(`${s}T00:00:00Z`).toISOString().startsWith(s) ||
		ctx.mustBe("an existing date (YYYY-MM-DD)"),
);
/** HH:MM (00:00〜23:59)。現地時刻で、タイムゾーンは持たない */
export const HhMm = type(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);
export const TripStatus = type.enumerated(...tripStatuses);
export const LegMode = type.enumerated(...legModes);

// ---- 出力 ----
/** 立ち寄り先。spot / station / custom (自分で登録した地点) のどれか */
export const Place = type({
	/** spot のときだけ。ピンの絵文字を引く */
	collectionId: "string | null",
	id: "string",
	/** custom のときだけ (hotel / parking / other) */
	kind: "string | null",
	lat: Latitude,
	lng: Longitude,
	name: "string",
	type: "'spot' | 'station' | 'custom'",
});
export type Place = typeof Place.infer;

/** 次の立ち寄り先への移動 */
export const Leg = type({
	arriveTime: HhMm.or("null"),
	departTime: HhMm.or("null"),
	id: "string",
	memo: "string | null",
	mode: LegMode,
	url: "string | null",
});
export type Leg = typeof Leg.infer;

export const Stop = type({
	approachMemo: "string | null",
	arriveTime: HhMm.or("null"),
	departTime: HhMm.or("null"),
	id: "string",
	/** 同じ日の次の stop への移動。最後の stop と、まだ入力していない区間は null */
	leg: Leg.or("null"),
	memo: "string | null",
	place: Place,
});
export type Stop = typeof Stop.infer;

export const Day = type({
	date: IsoDate,
	id: "string",
	memo: "string | null",
	stops: Stop.array(),
});
export type Day = typeof Day.infer;

export const TripSummary = type({
	days: type({ date: IsoDate, id: "string" }).array(),
	endDate: IsoDate.or("null"),
	id: "string",
	startDate: IsoDate.or("null"),
	status: TripStatus,
	title: "string",
	updatedAt: "string",
});
export type TripSummary = typeof TripSummary.infer;

export const TripDetail = type({
	days: Day.array(),
	endDate: IsoDate.or("null"),
	id: "string",
	memo: "string | null",
	startDate: IsoDate.or("null"),
	status: TripStatus,
	title: "string",
	updatedAt: "string",
});
export type TripDetail = typeof TripDetail.infer;

// ---- 入力 ----
export const TripIdParam = type({ id: "string" });
export type TripIdParam = typeof TripIdParam.infer;
export const DayParam = type({ dayId: "string", id: "string" });
export type DayParam = typeof DayParam.infer;
export const StopParam = type({ id: "string", stopId: "string" });
export type StopParam = typeof StopParam.infer;
/** DELETE は本文を持たないので、楽観ロックの値はクエリで受ける */
export const UpdatedAtQuery = type({ updatedAt: UpdatedAt });
export type UpdatedAtQuery = typeof UpdatedAtQuery.infer;

/** POST /api/trips */
export const TripCreateBody = type({
	"endDate?": IsoDate.or("null"),
	"memo?": Memo,
	"startDate?": IsoDate.or("null"),
	"status?": TripStatus,
	title: Title,
}).narrow((t, ctx) => {
	const problem = periodProblem(t, MAX_TRIP_DAYS);
	return problem === null || ctx.mustBe(problem);
});
export type TripCreateBody = typeof TripCreateBody.infer;

/** PATCH /api/trips/:id 。送った項目だけ変える */
export const TripUpdateBody = type({
	"endDate?": IsoDate.or("null"),
	"memo?": Memo,
	/** 期間を縮めて、地点が入った日が消えるときは true で送る (画面で確認してから) */
	"removeDaysWithStops?": "boolean",
	"startDate?": IsoDate.or("null"),
	"status?": TripStatus,
	"title?": Title,
	updatedAt: UpdatedAt,
});
export type TripUpdateBody = typeof TripUpdateBody.infer;

/** POST /api/trips/:id/days/:dayId/stops 。index 省略時は末尾 */
export const StopCreateBody = type({
	"index?": "number.integer >= 0",
	place: { id: "string", type: "'spot' | 'station' | 'custom'" },
	updatedAt: UpdatedAt,
});
export type StopCreateBody = typeof StopCreateBody.infer;

/** PATCH /api/trips/:id/stops/:stopId */
export const StopUpdateBody = type({
	"approachMemo?": Memo,
	"arriveTime?": HhMm.or("null"),
	"departTime?": HhMm.or("null"),
	"memo?": Memo,
	updatedAt: UpdatedAt,
});
export type StopUpdateBody = typeof StopUpdateBody.infer;

/** PUT /api/trips/:id/days/:dayId/order 。その日の stop を全部、新しい順で */
export const StopOrderBody = type({
	stopIds: "string[] > 0",
	updatedAt: UpdatedAt,
});
export type StopOrderBody = typeof StopOrderBody.infer;

/** PUT /api/trips/:id/stops/:stopId/leg 。stop から同じ日の次の stop への移動 */
export const LegBody = type({
	"arriveTime?": HhMm.or("null"),
	"departTime?": HhMm.or("null"),
	"memo?": Memo,
	mode: LegMode,
	updatedAt: UpdatedAt,
	"url?": HttpUrl.or("null"),
});
export type LegBody = typeof LegBody.infer;
