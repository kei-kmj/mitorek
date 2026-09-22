// おでかけプランの振り返り: 行ったスポットにチェックして「確定」すると訪問になる。旅の途中から使える
import { el, getJson, sendJson } from "./dom.js";
import { photoStrip } from "./photos.js";
import { formatDay } from "./trip-labels.js";

/** 今日 (日本時間) の YYYY-MM-DD */
const todayInJapan = () =>
	new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

const hint = (text) => el("p", { className: "hint", textContent: text });

/** 1 行: 記録済みなら ✓ と写真、未記録ならチェック (最初から付けておき、行かなかったものを外す) */
const itemRow = (item, collections, reload) => {
	const name = `${collections[item.collectionId] ?? "📍"} ${item.name}`;
	if (item.visits.length > 0) {
		return el(
			"li",
			{ className: "review-item is-recorded" },
			el("span", { textContent: `✓ ${name}` }),
			el("span", { className: "hint", textContent: "記録済み" }),
			...item.visits.map((visit) => photoStrip(visit, reload)),
		);
	}
	const box = el("input", {
		checked: true,
		type: "checkbox",
		value: item.stopId,
	});
	return el(
		"li",
		{ className: "review-item" },
		el("label", {}, box, ` ${name}`),
	);
};

/** 「確定」: チェックの付いた立ち寄りを送り、返ってきた振り返りで描き直す */
const confirmButton = ({ list, render, status, trip }) =>
	el("button", {
		className: "primary",
		onclick: async () => {
			const stopIds = [
				...list.querySelectorAll("input[type=checkbox]:checked"),
			].map((b) => b.value);
			const { json, status: code } = await sendJson(
				"POST",
				`/api/trips/${trip.id}/review`,
				{ stopIds },
			);
			if (Array.isArray(json)) {
				status.textContent = "";
				render(json);
				return;
			}
			status.textContent =
				json.error?.message ?? `確定できませんでした (${code})`;
		},
		textContent: "確定",
		type: "button",
	});

/** 旅が始まっていれば振り返りを出す (延期中など日付が無ければ出さない) */
export const hasStarted = (trip) =>
	Boolean(trip.startDate) && trip.startDate <= todayInJapan();

/** 振り返りの欄。中身は描くたびに API から読む */
export const reviewPanel = (trip, ctx) => {
	const list = el("div", {}, hint("読み込み中…"));
	const status = el("p", { className: "error" });

	const render = (items) => {
		if (items.length === 0) {
			list.replaceChildren(hint("スポットが入っていません"));
			return;
		}
		const days = [...Map.groupBy(items, (i) => i.date)].map(
			([date, dayItems]) =>
				el(
					"div",
					{ className: "review-day" },
					el("h3", { textContent: formatDay(date) }),
					el(
						"ul",
						{ className: "review-list" },
						...dayItems.map((i) => itemRow(i, ctx.collections, load)),
					),
				),
		);
		const pending = items.some((i) => i.visits.length === 0);
		list.replaceChildren(
			...days,
			pending && confirmButton({ list, render, status, trip }),
		);
	};

	async function load() {
		render(await getJson(`/api/trips/${trip.id}/review`));
	}
	load();
	return el(
		"section",
		{ className: "review" },
		el("h2", { textContent: "振り返り" }),
		hint(
			"行ったスポットにチェックして「確定」すると、その日の訪問として記録します。行かなかったものはチェックを外してください。",
		),
		list,
		status,
	);
};
