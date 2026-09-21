/** 日付 (YYYY-MM-DD) の計算。暦日だけを扱い、タイムゾーンは持たない (UTC で数える) */

const MS_PER_DAY = 86_400_000;
const ISO_DATE_LENGTH = 10;

const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);

interface Period {
	endDate?: string | null;
	startDate?: string | null;
	status?: string;
}

/** start から end まで (両端を含む) の日付の列 */
export const datesBetween = (start: string, end: string): string[] => {
	const count = (toTime(end) - toTime(start)) / MS_PER_DAY + 1;
	return Array.from({ length: Math.max(count, 0) }, (_, i) =>
		new Date(toTime(start) + i * MS_PER_DAY)
			.toISOString()
			.slice(0, ISO_DATE_LENGTH),
	);
};

/**
 * 旅程の期間の問題点。問題がなければ null。
 * 延期以外は開始日・終了日が必須で、開始 <= 終了、日数は maxDays まで
 */
export const periodProblem = (p: Period, maxDays: number): string | null => {
	if (!(p.startDate && p.endDate)) {
		if (p.status === "postponed") {
			return null;
		}
		return "startDate and endDate are required unless postponed";
	}
	const days = datesBetween(p.startDate, p.endDate).length;
	if (days < 1 || days > maxDays) {
		return `the period must be 1 to ${maxDays} days`;
	}
	return null;
};
