// 地図ページ (src/pages/map.tsx) の島。Leaflet は CDN から読み込み済みの前提
import { el, formatKm, getJson } from "./dom.js";
import { bindMapHash } from "./map-hash.js";
import { spreadShifts, twinGroups } from "./map-spread.js";
import { bindStations } from "./map-stations.js";
import { visitSection } from "./map-visits.js";

const { L } = globalThis;

/**
 * 初期表示の範囲。北海道 (宗谷岬・根室) 〜 九州 (佐多岬・五島) が収まる矩形。
 * 固定ズームだと画面の広さで余白が変わるので、範囲を合わせる
 */
const JAPAN_SOUTH = 30.9;
const JAPAN_WEST = 128.6;
const JAPAN_NORTH = 45.6;
const JAPAN_EAST = 145.9;
/** 0.25 刻みにして、範囲にぴったり寄せる (既定の 1 刻みだと一段引きすぎる) */
const ZOOM_STEP = 0.25;
const MIN_ZOOM = 4;
const MAX_ZOOM = 18;
const SPOT_ZOOM = 14;
/** 等高線が目立たず、道路・地名はまだ読める濃さ。ピンを浮かせるため少し薄め */
const TILE_OPACITY = 0.6;
/** app.css の .pin と揃える。絵文字だけなので、みんドラの丸アイコン (36px) より少し大きめ */
const PIN_SIZE = 40;
const CLOSE_SIZE = 24;
/** 円の右上 (45°) のふちに × を置く。bounds の角から中心へ 1/√2 戻した点 */
const DIAGONAL = Math.SQRT1_2;
/** 近傍検索に送る座標の桁 (約 0.1m) */
const COORD_DIGITS = 6;
const HTTP_URL = /^https?:\/\//u;
const PIN_CLASS = { false: "pin is-unvisited", true: "pin is-visited" };

const map = L.map("map", {
	maxZoom: MAX_ZOOM,
	minZoom: MIN_ZOOM,
	zoomDelta: ZOOM_STEP * 2,
	zoomSnap: ZOOM_STEP,
});
// 国土地理院 淡色地図。標準地図の陰影・地形の色分けが無い。
// 等高線と標高点は残るので、不透明度を少し下げて目立たなくする
// 利用規約: https://maps.gsi.go.jp/development/ichiran.html (出典の明示で利用可)
L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
	attribution:
		'<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>',
	maxZoom: MAX_ZOOM,
	opacity: TILE_OPACITY,
}).addTo(map);
bindMapHash(map, () =>
	map.fitBounds([
		[JAPAN_SOUTH, JAPAN_WEST],
		[JAPAN_NORTH, JAPAN_EAST],
	]),
);

const collectionBoxes = [
	...document.querySelectorAll('input[name="collection"]'),
];
const collections = new Map(
	collectionBoxes.map((box) => [
		box.value,
		{ emoji: box.dataset.emoji, name: box.dataset.name },
	]),
);
const unvisitedOnly = document.getElementById("unvisited-only");
const radiusSelect = document.getElementById("radius");
const nearbyStatus = document.getElementById("nearby-status");
const nearbyList = document.getElementById("nearby-list");
const nearbyClear = document.getElementById("nearby-clear");

const nearbyLayer = L.layerGroup().addTo(map);
const spotLayer = L.layerGroup().addTo(map);
/** spot.id → marker。近傍リストから該当ピンを開くのに使う */
const markers = new Map();
let spots = [];

/** コレクションの絵文字だけを出す。訪問済みはグレーアウト (app.css) */
const pinElement = (spot) =>
	el(
		"span",
		{ className: PIN_CLASS[spot.visited] },
		collections.get(spot.collectionId)?.emoji ?? "📍",
	);

/** spot.id → 画面上のずらし量 [dx, dy] (px)。同じ場所の別スポットを横に並べるため (map-spread.js) */
const shifts = new Map();

const pinIcon = (spot) => {
	const [dx, dy] = shifts.get(spot.id) ?? [0, 0];
	return L.divIcon({
		className: "",
		html: pinElement(spot),
		// 基準点 (本来の位置) をずらすと、ピンは逆向きに動く
		iconAnchor: [PIN_SIZE / 2 - dx, PIN_SIZE / 2 - dy],
		iconSize: [PIN_SIZE, PIN_SIZE],
	});
};

/** 表示中の、すぐ近くにあるスポットの組。ズームのたびに重なりを見て並べ直す */
let twins = [];

const spreadTwins = () => {
	const changed = [...spreadShifts(map, twins, PIN_SIZE)].filter(
		([id, [dx, dy]]) => String(shifts.get(id) ?? [0, 0]) !== String([dx, dy]),
	);
	for (const [id, shift] of changed) {
		shifts.set(id, shift);
		markers.get(id)?.setIcon(pinIcon(spots.find((s) => s.id === id)));
	}
};

const popupOf = (spot) =>
	el(
		"div",
		{ className: "popup" },
		el("strong", { textContent: spot.name }),
		el("div", {
			className: "meta",
			// 訪問の状態は下の訪問欄 (map-visits.js) が出す
			textContent:
				collections.get(spot.collectionId)?.name ?? spot.collectionId,
		}),
		spot.reward && el("div", { textContent: `🎁 ${spot.reward}` }),
		spot.note && el("div", { className: "note", textContent: spot.note }),
		HTTP_URL.test(spot.officialUrl ?? "") &&
			el("a", {
				href: spot.officialUrl,
				rel: "noopener noreferrer",
				target: "_blank",
				textContent: "公式ページ",
			}),
		visitSection(spot, (visited) => updateVisited(spot, visited)),
		el("button", {
			// 起点のスポット自身は結果から外す (距離 0 で必ず先頭に出てしまう)
			onclick: () =>
				showNearby(L.latLng(spot.lat, spot.lng), { excludeId: spot.id }),
			textContent: "近くのスポットを探す",
			type: "button",
		}),
	);

/** サイドバーの「訪問済み / 全体」を、今のスポットの状態から数え直す */
const updateCounts = () => {
	for (const box of collectionBoxes) {
		const mine = spots.filter((s) => s.collectionId === box.value);
		const count = box.closest("label")?.querySelector(".count");
		if (count) {
			count.textContent = `${mine.filter((s) => s.visited).length} / ${mine.length}`;
		}
	}
};

/** 「行った」「取り消し」の結果をピン (グレーアウト) と件数に映す */
const updateVisited = (spot, visited) => {
	if (spot.visited === visited) {
		return;
	}
	spot.visited = visited;
	markers.get(spot.id)?.setIcon(pinIcon(spot));
	updateCounts();
};

const selectedCollections = () =>
	new Set(collectionBoxes.filter((b) => b.checked).map((b) => b.value));

const renderSpots = () => {
	const selected = selectedCollections();
	spotLayer.clearLayers();
	markers.clear();
	const visible = spots.filter(
		(spot) =>
			selected.has(spot.collectionId) &&
			!(unvisitedOnly.checked && spot.visited),
	);
	for (const spot of visible) {
		const marker = L.marker([spot.lat, spot.lng], {
			icon: pinIcon(spot),
			title: spot.name,
		}).bindPopup(() => popupOf(spot));
		markers.set(spot.id, marker);
		spotLayer.addLayer(marker);
	}
	twins = twinGroups(visible);
	spreadTwins();
};

const focusSpot = (spot) => {
	map.setView([spot.lat, spot.lng], Math.max(map.getZoom(), SPOT_ZOOM));
	markers.get(spot.id)?.openPopup();
};

const nearbyItem = (spot) =>
	el(
		"li",
		{},
		el(
			"button",
			{ onclick: () => focusSpot(spot), type: "button" },
			`${collections.get(spot.collectionId)?.emoji ?? ""} ${spot.name}`,
			el("span", {
				className: "distance",
				textContent: formatKm(spot.distanceM),
			}),
		),
	);

/** 検索のたびに増やす。消した後や次の検索の後に、古い検索の結果を描かないため */
let searchSeq = 0;

/** 円と検索結果を消す (左の「クリア」と、地図上の × から) */
const clearNearby = () => {
	searchSeq += 1;
	nearbyLayer.clearLayers();
	nearbyStatus.textContent = "";
	nearbyList.replaceChildren();
	nearbyClear.hidden = true;
};

/** 円の右上のふちに置く × ボタン。マーカーなのでクリックは地図 (= 新しい検索) に伝わらない */
const closeMarker = (circle) => {
	const center = circle.getLatLng();
	const ne = circle.getBounds().getNorthEast();
	const at = L.latLng(
		center.lat + (ne.lat - center.lat) * DIAGONAL,
		center.lng + (ne.lng - center.lng) * DIAGONAL,
	);
	return L.marker(at, {
		icon: L.divIcon({
			className: "nearby-close",
			html: "×",
			iconAnchor: [CLOSE_SIZE / 2, CLOSE_SIZE / 2],
			iconSize: [CLOSE_SIZE, CLOSE_SIZE],
		}),
		keyboard: true,
		title: "円と検索結果を消す",
	}).on("click", clearNearby);
};

/**
 * 地点から半径内の未訪問を距離順に出す。表示中のコレクションだけに絞る。
 * スポットを起点にしたときは excludeId でそのスポットを除く
 */
async function showNearby(latlng, { excludeId } = {}) {
	searchSeq += 1;
	const seq = searchSeq;
	const radius = Number(radiusSelect.value);
	nearbyLayer.clearLayers();
	const circle = L.circle(latlng, { className: "nearby-circle", radius });
	// × の位置は円の大きさから決まるので、先に地図へ載せてから求める
	circle.addTo(nearbyLayer);
	closeMarker(circle).addTo(nearbyLayer);
	nearbyStatus.textContent = "検索中…";
	nearbyList.replaceChildren();
	nearbyClear.hidden = false;

	const params = new URLSearchParams({
		lat: latlng.lat.toFixed(COORD_DIGITS),
		lng: latlng.lng.toFixed(COORD_DIGITS),
		r: String(radius),
	});
	try {
		const selected = selectedCollections();
		const found = (await getJson(`/api/spots/nearby?${params}`)).filter(
			(s) => selected.has(s.collectionId) && s.id !== excludeId,
		);
		if (seq !== searchSeq) {
			return;
		}
		nearbyStatus.textContent = `半径 ${formatKm(radius)} (直線距離) に未踏 ${found.length} 件`;
		nearbyList.replaceChildren(...found.map(nearbyItem));
	} catch (error) {
		if (seq === searchSeq) {
			nearbyStatus.textContent = `取得に失敗しました (${error.message})`;
		}
	}
}

// ピンや駅のクリックは地図まで伝わらないので、ここに来るのは地図の空き地だけ
map.on("click", (e) => showNearby(e.latlng));
map.on("zoomend", spreadTwins);
nearbyClear.addEventListener("click", clearNearby);
for (const box of [...collectionBoxes, unvisitedOnly]) {
	box.addEventListener("change", renderSpots);
}
bindStations(map, { onNearby: showNearby });

try {
	spots = await getJson("/api/spots");
	renderSpots();
} catch (error) {
	nearbyStatus.textContent = `スポットの取得に失敗しました (${error.message})`;
}
