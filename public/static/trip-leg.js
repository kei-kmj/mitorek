// 立ち寄りと立ち寄りの間の移動 (leg)。手段を選ぶと移動ができ、「—」に戻すと消える
import { el } from "./dom.js";
import { MODE_LABEL } from "./trip-labels.js";

const MEMO_MIN_ROWS = 3;

/** data-key は描き直した後にフォーカスを戻すための目印 (trip.js) */
const keyed = (key, tag, props, ...children) => {
	const node = el(tag, props, ...children);
	node.dataset.key = key;
	return node;
};

/** 移動の入力欄。移動が無いうちは手段以外を入力できない (手段を選ぶと移動ができる) */
const legControls = (stop) => {
	const { leg } = stop;
	const key = (name) => `leg:${stop.id}:${name}`;
	const text = (name, props) =>
		keyed(key(name), "input", {
			...props,
			disabled: !leg,
			value: leg?.[name] ?? "",
		});
	return {
		arriveTime: text("arriveTime", { title: "到着", type: "time" }),
		departTime: text("departTime", { title: "出発", type: "time" }),
		memo: keyed(key("memo"), "textarea", {
			disabled: !leg,
			maxLength: 2000,
			placeholder: "移動のメモ (乗り換え・切符・注意など)",
			// 書いてある行数に合わせて広げる (最低 MEMO_MIN_ROWS 行)
			rows: Math.max(MEMO_MIN_ROWS, (leg?.memo ?? "").split("\n").length + 1),
			value: leg?.memo ?? "",
		}),
		mode: keyed(
			key("mode"),
			"select",
			{ title: "移動手段" },
			el("option", { textContent: "— 移動 —", value: "" }),
			...Object.entries(MODE_LABEL).map(([value, label]) =>
				el("option", {
					selected: value === leg?.mode,
					textContent: label,
					value,
				}),
			),
		),
		url: text("url", { placeholder: "経路の URL (ジョルダン等)", type: "url" }),
	};
};

/**
 * 2 段目のメモ。書いてあれば出し、無ければ「＋ メモ」で開く。
 * 開いたかは ctx.openLegMemos に覚え、描き直しても閉じない
 */
const memoRow = (stop, memo, ctx) => {
	const { leg } = stop;
	if (!leg) {
		return null;
	}
	if (leg.memo || ctx.openLegMemos.has(stop.id)) {
		return el("div", { className: "leg-memo" }, memo);
	}
	return el("button", {
		className: "leg-add-memo",
		onclick: () => {
			ctx.openLegMemos.add(stop.id);
			ctx.rerender();
			document
				.querySelector(`[data-key="leg:${CSS.escape(stop.id)}:memo"]`)
				?.focus();
		},
		textContent: "＋ メモ",
		type: "button",
	});
};

/** 移動の欄: 1 段目に手段・時刻・経路、2 段目にメモ */
export const legRow = (stop, ctx) => {
	const { h } = ctx;
	const { leg } = stop;
	const { arriveTime, departTime, memo, mode, url } = legControls(stop);
	const save = () => {
		if (!mode.value) {
			h.deleteLeg(stop);
			return;
		}
		h.putLeg(stop, {
			arriveTime: arriveTime.value || null,
			departTime: departTime.value || null,
			memo: memo.value || null,
			mode: mode.value,
			url: url.value || null,
		});
	};
	for (const control of [mode, departTime, arriveTime, url, memo]) {
		control.addEventListener("change", save);
	}
	return el(
		"li",
		{ className: "leg" },
		el(
			"div",
			{ className: "leg-main" },
			el("span", { className: "leg-arrow", textContent: "↓" }),
			mode,
			departTime,
			el("span", { textContent: "→" }),
			arriveTime,
			url,
			leg?.url &&
				el("a", {
					href: leg.url,
					rel: "noopener noreferrer",
					target: "_blank",
					textContent: "経路を開く",
				}),
		),
		memoRow(stop, memo, ctx),
	);
};
