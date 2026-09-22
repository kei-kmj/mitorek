// 旅程の編集画面 (src/pages/trip.tsx) の描画。操作は handlers (trip.js) に渡す
import { el } from "./dom.js";
import { formatDay, placeEmoji, STATUS_LABEL } from "./trip-labels.js";
import { legRow } from "./trip-leg.js";
import { hasStarted, reviewPanel } from "./trip-review.js";

const field = (label, control) =>
	el("label", { className: "field" }, label, control);

/** data-key は描き直した後にフォーカスを戻すための目印 (trip.js) */
const keyed = (key, tag, props, ...children) => {
	const node = el(tag, props, ...children);
	node.dataset.key = key;
	return node;
};

/** 見出しの入力欄 (1 段目): タイトル・期間・状態 */
const headerFields = (trip) => [
	field(
		"タイトル",
		keyed("title", "input", {
			maxLength: 100,
			name: "title",
			required: true,
			value: trip.title,
		}),
	),
	field(
		"開始日",
		keyed("startDate", "input", {
			name: "startDate",
			type: "date",
			value: trip.startDate ?? "",
		}),
	),
	field(
		"終了日",
		keyed("endDate", "input", {
			name: "endDate",
			type: "date",
			value: trip.endDate ?? "",
		}),
	),
	field(
		"状態",
		keyed(
			"status",
			"select",
			{ name: "status" },
			...Object.entries(STATUS_LABEL).map(([value, label]) =>
				el("option", {
					selected: value === trip.status,
					textContent: label,
					value,
				}),
			),
		),
	),
];

const MEMO_MIN_ROWS = 3;

/** 見出しのメモ欄 (2 段目)。書いた行数に合わせて広げる */
const headerMemo = (trip) =>
	keyed("memo", "textarea", {
		maxLength: 2000,
		name: "memo",
		placeholder: "このおでかけプランのメモ",
		rows: Math.max(MEMO_MIN_ROWS, (trip.memo ?? "").split("\n").length + 1),
		value: trip.memo ?? "",
	});

/**
 * メモが無ければ「＋ メモ」を出し、押したらその場で入力欄に差し替える。
 * 見出しは「保存」まで送らないので、描き直すと書きかけのタイトルなどが消える。だから描き直さない
 */
const headerMemoRow = (trip, ctx) => {
	const memo = el("div", { className: "trip-memo" }, headerMemo(trip));
	if (trip.memo || ctx.openTripMemo.value) {
		return memo;
	}
	const button = el("button", {
		className: "add-memo",
		onclick: () => {
			ctx.openTripMemo.value = true;
			button.replaceWith(memo);
			memo.querySelector("textarea")?.focus();
		},
		textContent: "＋ メモ",
		type: "button",
	});
	return button;
};

/** 旅程の見出し。1 段目にタイトル・期間・状態と操作、2 段目にメモ。「保存」でまとめて送る */
const headerForm = (trip, ctx) => {
	const { h } = ctx;
	const form = el(
		"form",
		{ className: "trip-form" },
		el(
			"div",
			{ className: "trip-form-main" },
			...headerFields(trip),
			el(
				"div",
				{ className: "actions" },
				el("button", {
					className: "primary",
					textContent: "保存",
					type: "submit",
				}),
				el("button", {
					className: "danger",
					onclick: () => h.deleteTrip(),
					textContent: "削除",
					type: "button",
				}),
			),
		),
		headerMemoRow(trip, ctx),
	);
	form.addEventListener("submit", (e) => {
		e.preventDefault();
		const data = Object.fromEntries(new FormData(form));
		h.saveHeader({
			endDate: data.endDate || null,
			memo: data.memo || null,
			startDate: data.startDate || null,
			status: data.status,
			title: data.title,
		});
	});
	return form;
};

/** 時刻・メモは入力し終えたとき (change) に 1 項目ずつ送る */
const stopField = (stop, name, props, h) => {
	const control = keyed(`stop:${stop.id}:${name}`, "input", {
		...props,
		value: stop[name] ?? "",
	});
	control.addEventListener("change", () =>
		h.updateStop(stop, { [name]: control.value || null }),
	);
	return control;
};

const stopRow = (day, stop, index, ctx) => {
	const { collections, h } = ctx;
	const last = index === day.stops.length - 1;
	return el(
		"li",
		{ className: "stop" },
		el(
			"div",
			{ className: "stop-head" },
			el("span", {
				className: "stop-emoji",
				textContent: placeEmoji(stop.place, collections),
			}),
			el("strong", { textContent: stop.place.name }),
			el(
				"span",
				{ className: "stop-actions" },
				el("button", {
					disabled: index === 0,
					onclick: () => h.moveStop(day, index, -1),
					textContent: "↑",
					title: "上へ",
					type: "button",
				}),
				el("button", {
					disabled: last,
					onclick: () => h.moveStop(day, index, 1),
					textContent: "↓",
					title: "下へ",
					type: "button",
				}),
				el("button", {
					onclick: () => h.deleteStop(day, stop),
					textContent: "×",
					title: "この地点を外す",
					type: "button",
				}),
			),
		),
		el(
			"div",
			{ className: "stop-fields" },
			field("着", stopField(stop, "arriveTime", { type: "time" }, h)),
			field("発", stopField(stop, "departTime", { type: "time" }, h)),
			field(
				"メモ",
				stopField(stop, "memo", { maxLength: 2000, type: "text" }, h),
			),
			field(
				"行き方メモ (非公開)",
				stopField(stop, "approachMemo", { maxLength: 2000, type: "text" }, h),
			),
		),
	);
};

const dayCard = (day, ctx) => {
	const items = day.stops.flatMap((stop, i) => {
		const row = stopRow(day, stop, i, ctx);
		// 次の地点があれば、その間の移動を挟む
		if (i < day.stops.length - 1) {
			return [row, legRow(stop, ctx)];
		}
		return [row];
	});
	return el(
		"section",
		{ className: "day" },
		el("h2", { textContent: formatDay(day.date) }),
		day.stops.length === 0 &&
			el("p", { className: "hint", textContent: "まだ地点がありません" }),
		el("ol", { className: "stops" }, ...items),
		ctx.searchPanel(day),
	);
};

/** 旅程全体を描く */
export const renderTrip = (root, trip, ctx) => {
	const days = trip.days.map((day) => dayCard(day, ctx));
	if (days.length === 0) {
		days.push(
			el("p", {
				className: "hint",
				textContent: "日付が決まると、日ごとに地点を入れられます",
			}),
		);
	}
	root.replaceChildren(
		el(
			"p",
			{ className: "hint" },
			el("a", { href: "/trips", textContent: "← おでかけプラン一覧" }),
		),
		el("h1", { textContent: trip.title }),
		headerForm(trip, ctx),
		el("p", { className: "error", id: "trip-status" }),
		...days,
		// 旅が始まったら (日本時間で開始日以降)、行ったかの振り返りを出す
		hasStarted(trip) && reviewPanel(trip, ctx),
	);
};
