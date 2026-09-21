// 日に地点を足すパネル: 名前で探す (スポット・駅・自分の地点) か、住所・施設名から自分の地点を登録する
import { el, getJson, sendJson } from "./dom.js";
import { KIND_LABEL, placeEmoji } from "./trip-labels.js";

const MIN_QUERY = 2;
const CREATED = 201;
const DEBOUNCE_MS = 300;
/** 候補の出典 (src/lib/geocode.ts) */
const SOURCE_LABEL = { gsi: "住所", osm: "施設" };

/** data-key は描き直した後にフォーカスを戻すための目印 (trip.js) */
const keyed = (key, tag, props, ...children) => {
	const node = el(tag, props, ...children);
	node.dataset.key = key;
	return node;
};

/** 候補の一覧。0 件なら「見つかりませんでした」 */
const listOrEmpty = (items) => {
	if (items.length > 0) {
		return items;
	}
	return [el("li", { className: "hint", textContent: "見つかりませんでした" })];
};

const candidateButton = (place, collections, onPick) =>
	el(
		"li",
		{},
		el(
			"button",
			{ onclick: () => onPick(place), type: "button" },
			`${placeEmoji(place, collections)} ${place.name}`,
			place.detail &&
				el("span", { className: "hint", textContent: ` ${place.detail}` }),
		),
	);

/** 住所・施設名の候補 1 件: 名前と種類を決めて「登録して足す」 */
const geocodeItem = (result, day, ctx) => {
	const name = el("input", {
		maxLength: 100,
		type: "text",
		value: result.name,
	});
	const kind = el(
		"select",
		{},
		...Object.entries(KIND_LABEL).map(([value, label]) =>
			el("option", { textContent: label, value }),
		),
	);
	const register = async () => {
		const { json, status } = await sendJson("POST", "/api/places", {
			kind: kind.value,
			lat: result.lat,
			lng: result.lng,
			name: name.value,
		});
		if (status !== CREATED) {
			ctx.showError(json.error?.message ?? `登録できませんでした (${status})`);
			return;
		}
		ctx.h.addStop(day, json);
	};
	return el(
		"li",
		{ className: "geocode-item" },
		el("span", {
			className: "hint",
			textContent: `${SOURCE_LABEL[result.source]}: ${result.detail ?? result.name}`,
		}),
		name,
		kind,
		el("button", {
			onclick: register,
			textContent: "登録して足す",
			type: "button",
		}),
	);
};

const addressSearch = (day, ctx) => {
	const address = keyed(`address:${day.id}`, "input", {
		placeholder: "住所や施設名 (例: 松本 ブエナビスタ)",
		type: "search",
	});
	const results = el("ul", { className: "candidates" });
	const run = async () => {
		if (address.value.trim().length < MIN_QUERY) {
			return;
		}
		const found = await getJson(
			`/api/places/geocode?q=${encodeURIComponent(address.value.trim())}`,
		);
		results.replaceChildren(
			...listOrEmpty(found.map((r) => geocodeItem(r, day, ctx))),
		);
	};
	address.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			run();
		}
	});
	return el(
		"div",
		{ className: "address-search" },
		el("p", {
			className: "hint",
			textContent:
				"宿などは、住所や施設名から自分の地点として登録できます。施設名は地名と一緒に入れると見つかりやすい",
		}),
		address,
		el("button", { onclick: run, textContent: "探す", type: "button" }),
		results,
		el("p", {
			className: "hint",
			textContent:
				"施設名: © OpenStreetMap contributors (Nominatim) / 住所: 国土地理院 地名検索",
		}),
	);
};

/** 日ごとの「地点を足す」。開いているかは ctx.openPanels に覚え、描き直しても閉じない */
export const searchPanel = (day, ctx) => {
	const query = keyed(`search:${day.id}`, "input", {
		placeholder: "スポット・駅・登録した地点の名前",
		type: "search",
	});
	const results = el("ul", { className: "candidates" });
	let timer = 0;
	query.addEventListener("input", () => {
		clearTimeout(timer);
		timer = setTimeout(async () => {
			const q = query.value.trim();
			if (q.length < MIN_QUERY) {
				results.replaceChildren();
				return;
			}
			const found = await getJson(
				`/api/places/search?q=${encodeURIComponent(q)}`,
			);
			results.replaceChildren(
				...listOrEmpty(
					found.map((p) =>
						candidateButton(p, ctx.collections, (place) =>
							ctx.h.addStop(day, place),
						),
					),
				),
			);
		}, DEBOUNCE_MS);
	});
	const panel = el(
		"details",
		{ className: "add-stop", open: ctx.openPanels.has(day.id) },
		el("summary", { textContent: "＋ 地点を足す" }),
		query,
		results,
		addressSearch(day, ctx),
	);
	panel.addEventListener("toggle", () => {
		if (panel.open) {
			ctx.openPanels.add(day.id);
		} else {
			ctx.openPanels.delete(day.id);
		}
	});
	return panel;
};
