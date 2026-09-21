// 旅程の編集画面 (src/pages/trip.tsx) の島。状態 (trip) を持ち、変更のたびに API の結果で描き直す
import { getJson, sendJson } from "./dom.js";
import { renderTrip } from "./trip-render.js";
import { searchPanel } from "./trip-search.js";

const OK = 200;
const CREATED = 201;
const CONFLICT = 409;
const SUCCESS = new Set([OK, CREATED]);
/** 期間を縮めて地点の入った日が外れるときの 409 (src/models/trips.ts の文言) */
const DAYS_REMOVED = "期間から外れます";

const root = document.getElementById("trip");
const { tripId } = root.dataset;
const collections = JSON.parse(root.dataset.collections);
/** 今の旅程 (GET /api/trips/:id の形)。updatedAt を楽観ロックに使う */
let trip = null;

/**
 * 確認と通知。画面内のダイアログを作るまではブラウザ標準のものを使う
 * (件数の多い操作ではないので、止めてでも確実に気づいてほしい場面だけ)
 */
// biome-ignore lint/suspicious/noAlert: 上のとおり、意図して標準の確認を使う
const ask = (message) => globalThis.confirm(message);
// biome-ignore lint/suspicious/noAlert: 同上
const tell = (message) => globalThis.alert(message);

const showError = (message) => {
	const status = document.getElementById("trip-status");
	if (status) {
		status.textContent = message;
	}
};

/** 描き直す。入力中だった欄 (data-key) にフォーカスを戻す */
const render = () => {
	const activeKey = document.activeElement?.dataset?.key;
	renderTrip(root, trip, ctx);
	if (activeKey) {
		root.querySelector(`[data-key="${CSS.escape(activeKey)}"]`)?.focus();
	}
};

const load = async () => {
	trip = await getJson(`/api/trips/${tripId}`);
	render();
};

/**
 * 変更を送る。DELETE は updatedAt をクエリで、それ以外は本文に入れる。
 * 成功なら描き直し、別の画面で更新されていた (409) なら知らせて読み込み直す
 */
const mutate = async (method, path, body = {}) => {
	// DELETE は本文を持たないので updatedAt をクエリで送る (sendJson は呼んだ時点で送信する)
	let url = `/api/trips/${tripId}${path}`;
	let payload = { ...body, updatedAt: trip.updatedAt };
	if (method === "DELETE") {
		url = `${url}?updatedAt=${encodeURIComponent(trip.updatedAt)}`;
		payload = undefined;
	}
	const { json, status } = await sendJson(method, url, payload);
	if (SUCCESS.has(status)) {
		// 旅程の削除だけは { id } を返すので、描き直さない (呼び出し側で一覧へ移る)
		if (json.days) {
			trip = json;
			render();
		}
		return { ok: true };
	}
	const message = json.error?.message ?? `保存できませんでした (${status})`;
	if (status === CONFLICT && !message.includes(DAYS_REMOVED)) {
		tell(message);
		await load();
		return { ok: false };
	}
	showError(message);
	return { message, ok: false, status };
};

/** 並びを変えると消える移動のうち、URL かメモが入っているもの */
const legsLost = (day, nextOrder) => {
	const kept = new Set(
		nextOrder.slice(1).map((to, i) => `${nextOrder[i]}>${to}`),
	);
	return day.stops.filter((stop, i) => {
		const next = day.stops[i + 1];
		return (
			stop.leg &&
			(stop.leg.url || stop.leg.memo) &&
			!(next && kept.has(`${stop.id}>${next.id}`))
		);
	});
};

/** 手入力の移動が消えるときは確認する (docs/design.md 未決事項 1) */
const confirmLegs = (day, nextOrder) => {
	const lost = legsLost(day, nextOrder);
	return (
		lost.length === 0 ||
		ask(`URL やメモを入れた移動が ${lost.length} 件消えます。続けますか？`)
	);
};

const h = {
	addStop: (day, place) =>
		mutate("POST", `/days/${day.id}/stops`, {
			place: { id: place.id, type: place.type },
		}),
	deleteLeg: (stop) => mutate("DELETE", `/stops/${stop.id}/leg`),
	deleteStop: (day, stop) => {
		const rest = day.stops.map((s) => s.id).filter((id) => id !== stop.id);
		if (confirmLegs(day, rest)) {
			mutate("DELETE", `/stops/${stop.id}`);
		}
	},
	deleteTrip: async () => {
		if (!ask(`「${trip.title}」を消します。元に戻せません。`)) {
			return;
		}
		const { ok } = await mutate("DELETE", "");
		if (ok) {
			globalThis.location.href = "/trips";
		}
	},
	moveStop: (day, index, delta) => {
		const order = day.stops.map((s) => s.id);
		[order[index], order[index + delta]] = [order[index + delta], order[index]];
		if (confirmLegs(day, order)) {
			mutate("PUT", `/days/${day.id}/order`, { stopIds: order });
		}
	},
	putLeg: (stop, leg) => mutate("PUT", `/stops/${stop.id}/leg`, leg),
	saveHeader: async (fields) => {
		const result = await mutate("PATCH", "", fields);
		if (
			result.message?.includes(DAYS_REMOVED) &&
			ask(`${result.message}\nこれらの日と地点を消しますか？`)
		) {
			await mutate("PATCH", "", { ...fields, removeDaysWithStops: true });
		}
	},
	updateStop: (stop, patch) => mutate("PATCH", `/stops/${stop.id}`, patch),
};

/** 描画側に渡すもの。openPanels は「地点を足す」を開いている日 (描き直しても閉じないため) */
const ctx = {
	collections,
	h,
	/** 「＋ メモ」でメモ欄を開いた移動 (出発側の stop の id) */
	openLegMemos: new Set(),
	openPanels: new Set(),
	/** 見出しの「＋ メモ」を開いたか (描き直しても閉じない) */
	openTripMemo: { value: false },
	/** 画面の中だけの変更 (メモ欄を開くなど) で描き直す */
	rerender: () => render(),
	searchPanel: (day) => searchPanel(day, ctx),
	showError,
};

try {
	await load();
} catch (error) {
	showError(`読み込めませんでした (${error.message})`);
}
