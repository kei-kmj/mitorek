// 旅程の画面の表示名 (サーバー側の表: src/pages/trip-labels.ts)

const KIND_EMOJI = { hotel: "🏨", other: "📌", parking: "🅿️" };

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const DATE_SLICE = 5;

export const STATUS_LABEL = {
	cancelled: "中止",
	confirmed: "確定",
	planning: "計画中",
	postponed: "延期",
};

export const MODE_LABEL = {
	bike: "自転車",
	bus: "バス",
	car: "車",
	ferry: "船",
	other: "その他",
	taxi: "タクシー",
	train: "電車",
	walk: "徒歩",
};

/** 自分の地点の種類 */
export const KIND_LABEL = { hotel: "宿", other: "その他", parking: "駐車場" };

/** 2026-10-10 → "10/10 (土)" */
export const formatDay = (date) =>
	`${date.slice(DATE_SLICE).replace("-", "/")} (${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]})`;

/** 地点の絵文字: スポットはコレクション、駅は 🚉、自分の地点は種類ごと */
export const placeEmoji = (place, collections) => {
	if (place.type === "spot") {
		return collections[place.collectionId] ?? "📍";
	}
	if (place.type === "station") {
		return "🚉";
	}
	return KIND_EMOJI[place.kind] ?? "📌";
};
