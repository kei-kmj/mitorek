// 表示位置を URL (#zoom/lat/lng) に持たせる。再読み込みしても位置が保たれ、共有もできる

const HASH = /^#(\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/u;
const ZOOM_DIGITS = 2;
const COORD_DIGITS = 5;

const readHash = () => {
	const match = globalThis.location.hash.match(HASH);
	if (match === null) {
		return null;
	}
	const [zoom, lat, lng] = match.slice(1).map(Number);
	return { center: [lat, lng], zoom };
};

/** 5.25 → "5.25"、12 → "12" (末尾の 0 を付けない) */
const formatZoom = (zoom) => String(Number(zoom.toFixed(ZOOM_DIGITS)));

/** URL に位置があればそこへ、無ければ fallback() で初期表示する */
export const bindMapHash = (map, fallback) => {
	const view = readHash();
	if (view) {
		map.setView(view.center, view.zoom);
	} else {
		fallback();
	}
	map.on("moveend", () => {
		const c = map.getCenter();
		const hash = `#${formatZoom(map.getZoom())}/${c.lat.toFixed(COORD_DIGITS)}/${c.lng.toFixed(COORD_DIGITS)}`;
		// 履歴を積むと「戻る」が地図の移動で埋まるので置き換える
		globalThis.history.replaceState(null, "", hash);
	});
};
