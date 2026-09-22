import type { TripSummary } from "../schemas/trips";

/** 旅程の状態の表示名 (画面の script 側にも同じ表がある: public/static/trip-labels.js) */
export const STATUS_LABEL: Record<TripSummary["status"], string> = {
	cancelled: "中止",
	completed: "終了",
	confirmed: "確定",
	planning: "計画中",
	postponed: "延期",
};

/** 2026-10-10 〜 2026-10-12 → "2026/10/10〜10/12"。日付なしは「日付未定」 */
export const formatPeriod = (start: string | null, end: string | null) => {
	if (!(start && end)) {
		return "日付未定";
	}
	const [y, m, d] = start.split("-");
	const [, m2, d2] = end.split("-");
	return `${y}/${m}/${d}〜${m2}/${d2}`;
};
