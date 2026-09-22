// スポットの吹き出しの「行った」と訪問の履歴。記録・取り消しの結果は onChange で地図に返す
import { el, getJson, sendJson } from "./dom.js";
import { photoStrip } from "./photos.js";

const CREATED = 201;
/** 位置が取れるまで待つ上限。取れなくても座標なしで記録する */
const GPS_TIMEOUT_MS = 8000;
const GPS_MAX_AGE_MS = 60_000;
const DATE_ONLY = 10;

/** 端末の位置。許可されない・取れないときは null (記録は止めない) */
const currentPosition = () =>
	new Promise((resolve) => {
		if (!globalThis.navigator.geolocation) {
			resolve(null);
			return;
		}
		globalThis.navigator.geolocation.getCurrentPosition(
			(p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
			() => resolve(null),
			{
				enableHighAccuracy: true,
				maximumAge: GPS_MAX_AGE_MS,
				timeout: GPS_TIMEOUT_MS,
			},
		);
	});

/** 2026-09-21T05:30:00.000Z → 2026/09/21 14:30 (日本時間)。日付だけならそのまま、不明なら「日付不明」 */
const formatVisitedAt = (visitedAt) => {
	if (!visitedAt) {
		return "日付不明";
	}
	if (visitedAt.length === DATE_ONLY) {
		return visitedAt.replaceAll("-", "/");
	}
	return new Date(visitedAt).toLocaleString("ja-JP", {
		dateStyle: "short",
		timeStyle: "short",
		timeZone: "Asia/Tokyo",
	});
};

/** 「行った」: 位置を添えて記録し、done() で描き直す */
const recordButton = (spot, status, done) =>
	el("button", {
		className: "primary",
		onclick: async (e) => {
			e.currentTarget.disabled = true;
			status.textContent = "記録しています…";
			const position = await currentPosition();
			const { json, status: code } = await sendJson("POST", "/api/visits", {
				spotId: spot.id,
				...position,
			});
			if (code !== CREATED) {
				status.textContent =
					json.error?.message ?? `記録できませんでした (${code})`;
				return;
			}
			done();
		},
		textContent: "行った",
		type: "button",
	});

// biome-ignore lint/suspicious/noAlert: 写真ごと消えるので、取り消しは標準の確認で止める
const ask = (message) => globalThis.confirm(message);

/** 履歴の 1 行: 日時と「取り消し」、その訪問の写真 */
const visitItem = (visit, done) =>
	el(
		"li",
		{},
		`✓ ${formatVisitedAt(visit.visitedAt)}`,
		el("button", {
			className: "link",
			onclick: async () => {
				const photos = visit.images.length;
				if (
					photos > 0 &&
					!ask(`写真 ${photos} 枚も一緒に消えます。取り消しますか？`)
				) {
					return;
				}
				await sendJson("DELETE", `/api/visits/${visit.id}`);
				done();
			},
			textContent: "取り消し",
			type: "button",
		}),
		photoStrip(visit, done),
	);

/**
 * 吹き出しの訪問欄。未訪問なら「行った」、訪問済みなら履歴と「取り消し」。
 * onChange(visited) で地図側のピンと件数を直す
 */
export const visitSection = (spot, onChange) => {
	const box = el("div", { className: "visit-box" });
	const status = el("div", { className: "meta" });

	/** 自分の訪問を読み直して描く。0 件になったら未訪問に戻す */
	const load = async () => {
		const visits = await getJson(
			`/api/visits?spotId=${encodeURIComponent(spot.id)}`,
		);
		status.textContent = "";
		onChange(visits.length > 0);
		if (visits.length === 0) {
			box.replaceChildren(recordButton(spot, status, load), status);
			return;
		}
		box.replaceChildren(
			el(
				"ul",
				{ className: "visit-list" },
				...visits.map((v) => visitItem(v, load)),
			),
			el("button", {
				className: "link",
				onclick: (e) =>
					e.currentTarget.replaceWith(recordButton(spot, status, load)),
				textContent: "もう一度行った",
				type: "button",
			}),
			status,
		);
	};

	if (spot.visited) {
		load();
	} else {
		box.replaceChildren(recordButton(spot, status, load), status);
	}
	return box;
};
