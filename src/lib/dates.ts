import type { tripStatuses } from "../db/schema/itinerary";

/** 暦日 (YYYY-MM-DD) だけを扱う。時刻もタイムゾーンも持たないので、UTC 上で数える */

const MS_PER_DAY = 86_400_000;
const ISO_DATE_LENGTH = 10;

const utcMidnightMs = (date: string) => Date.parse(`${date}T00:00:00Z`);

interface Period {
	endDate?: string | null;
	startDate?: string | null;
	status?: (typeof tripStatuses)[number];
}

/** start から end まで (両端を含む) */
export const datesBetween = (start: string, end: string): string[] => {
	const count = (utcMidnightMs(end) - utcMidnightMs(start)) / MS_PER_DAY + 1;
	return Array.from({ length: Math.max(count, 0) }, (_unused, dayOffset) =>
		new Date(utcMidnightMs(start) + dayOffset * MS_PER_DAY)
			.toISOString()
			.slice(0, ISO_DATE_LENGTH),
	);
};

/** 旅程の期間の問題点。問題がなければ null */
export const periodProblem = (p: Period, maxDays: number): string | null => {
	if (!(p.startDate && p.endDate)) {
		// 延期はいつ行くか決まっていないので、日付なしで作れる
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
