// 地図の駅表示。自前の stations テーブルを表示範囲の分だけ取り、点で出す。
// 駅名は背景の地図 (淡色地図) にあるので重ねない。点はクリックで路線と「近くのスポットを探す」を出すためのもの
import { el, getJson } from "./dom.js";

const { L } = globalThis;

/** これより引いた縮尺では駅を出さない (数が多すぎて線路が見えなくなる) */
const STATIONS_MIN_ZOOM = 11;
/** 都市部では点が密集するので、縁を薄く細くして地図とピンの邪魔をしない */
const DOT_RADIUS_PX = 4;
const CLICK_TOLERANCE_PX = 4;
/** canvas に描くので CSS は効かない。色はオプションで渡す */
const DOT_STYLE = {
	color: "#9aa0a6",
	fillColor: "#ffffff",
	fillOpacity: 1,
	weight: 1,
};

/** API が受け付ける矩形の最大幅 (度)。src/schemas/stations.ts と揃える */
const MAX_SPAN_DEG = 1;
/** 少し動かすたびに取り直さないよう、表示範囲より広めに取る */
const PREFETCH_RATIO = 0.5;
const COORD_DIGITS = 4;

const clampSpan = (min, max) => {
	const center = (min + max) / 2;
	const half = Math.min((max - min) / 2, MAX_SPAN_DEG / 2);
	return [center - half, center + half];
};

/** 表示範囲を広げ、API の上限に収めた矩形 */
const fetchBoundsOf = (map) => {
	const b = map.getBounds();
	const padLng = (b.getEast() - b.getWest()) * PREFETCH_RATIO;
	const padLat = (b.getNorth() - b.getSouth()) * PREFETCH_RATIO;
	const [west, east] = clampSpan(b.getWest() - padLng, b.getEast() + padLng);
	const [south, north] = clampSpan(
		b.getSouth() - padLat,
		b.getNorth() + padLat,
	);
	return { east, north, south, west };
};

const contains = (outer, b) =>
	outer &&
	outer.west <= b.getWest() &&
	outer.east >= b.getEast() &&
	outer.south <= b.getSouth() &&
	outer.north >= b.getNorth();

/** 駅の点。クリックは地図まで伝えない (空き地のクリック = 近傍検索と区別する) */
const stationMarker = (station, renderer, onNearby) =>
	L.circleMarker([station.lat, station.lng], {
		...DOT_STYLE,
		bubblingMouseEvents: false,
		radius: DOT_RADIUS_PX,
		renderer,
	}).bindPopup(() => popupOf(station, onNearby));

/** 事業者ごとに路線をまとめる: 「西日本旅客鉄道: 山陽線、播但線」 */
const linesByOperator = (lines) => {
	const groups = Map.groupBy(lines, (l) => l.operator ?? "");
	return [...groups].map(([operator, ls]) =>
		el("div", {
			className: "meta",
			textContent: `${operator && `${operator}: `}${ls.map((l) => l.name).join("、")}`,
		}),
	);
};

const popupOf = (station, onNearby) =>
	el(
		"div",
		{ className: "popup" },
		el("strong", { textContent: `🚉 ${station.name}` }),
		...linesByOperator(station.lines),
		el("button", {
			onclick: () => onNearby(L.latLng(station.lat, station.lng)),
			textContent: "近くのスポットを探す",
			type: "button",
		}),
	);

/**
 * 地図が止まるたびに、必要なら表示範囲の駅を取り直す。
 * onNearby(latlng) は呼び出し側 (map.js) の近傍検索
 */
export const bindStations = (map, { onNearby }) => {
	// 駅は数が多いので DOM ではなく canvas に描く
	// 点を小さくしたので、クリックの当たり判定だけ周り数 px まで広げる
	const renderer = L.canvas({ tolerance: CLICK_TOLERANCE_PX });
	const layer = L.layerGroup();
	let loaded = null;
	let pending = null;

	const toggle = () => {
		const zoom = map.getZoom();
		if (zoom < STATIONS_MIN_ZOOM) {
			layer.remove();
		} else {
			layer.addTo(map);
		}
	};

	const refresh = async () => {
		toggle();
		if (
			map.getZoom() < STATIONS_MIN_ZOOM ||
			contains(loaded, map.getBounds())
		) {
			return;
		}
		const b = fetchBoundsOf(map);
		const bbox = [b.west, b.south, b.east, b.north]
			.map((n) => n.toFixed(COORD_DIGITS))
			.join(",");
		pending?.abort();
		pending = new AbortController();
		try {
			const stations = await getJson(`/api/stations?bbox=${bbox}`, {
				signal: pending.signal,
			});
			layer.clearLayers();
			for (const station of stations) {
				layer.addLayer(stationMarker(station, renderer, onNearby));
			}
			loaded = b;
		} catch (error) {
			if (error.name !== "AbortError") {
				throw error;
			}
		}
	};

	map.on("moveend", refresh);
	refresh();
};
