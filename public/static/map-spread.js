// すぐ近くにあるスポット同士 (松本城のお土産と 100 名城、小諸城と小諸市動物園など) のピンが
// 画面上で重なるとき、横に並べる。
// ズームのたびに数え直すので、拡大して離れて見えるようになれば本来の位置に戻る

/** これより近いスポット同士を「同じ場所の組」とみなす。今のデータでは組はすべて 2 つ */
const TWIN_RADIUS_M = 500;
/** これより大きな組は並べない (横に長く並びすぎて地図が崩れるため) */
const MAX_GROUP = 4;
const EARTH_RADIUS_M = 6_371_000;
const HALF_TURN_DEG = 180;
const DEG_TO_RAD = Math.PI / HALF_TURN_DEG;
/** 並べるときのピンの間隔 (ピンの大きさに対する割合)。少し重ねて同じ場所だと分かるようにする */
const SPREAD_RATIO = 0.8;

/** 近い 2 点の距離 (m)。数百 m なので平面近似で足りる */
const distanceM = (a, b) => {
	const x =
		(b.lng - a.lng) * DEG_TO_RAD * Math.cos(((a.lat + b.lat) / 2) * DEG_TO_RAD);
	const y = (b.lat - a.lat) * DEG_TO_RAD;
	return Math.hypot(x, y) * EARTH_RADIUS_M;
};

/** TWIN_RADIUS_M 以内でつながるスポットの組 (2〜MAX_GROUP 個のものだけ) */
export const twinGroups = (spots) => {
	const root = spots.map((_, i) => i);
	// 親をたどって組の代表を探す (union-find)
	const find = (i) => {
		let node = i;
		while (root[node] !== node) {
			node = root[node];
		}
		return node;
	};
	for (const [i, a] of spots.entries()) {
		for (const [j, b] of spots.entries()) {
			if (j > i && distanceM(a, b) <= TWIN_RADIUS_M) {
				root[find(i)] = find(j);
			}
		}
	}
	const groups = Map.groupBy(spots, (_, i) => find(i));
	return [...groups.values()].filter(
		(group) => group.length > 1 && group.length <= MAX_GROUP,
	);
};

/**
 * 画面上で重なっている組を横に並べるためのずらし量 (px)。spotId → [dx, dy]。
 * 重なっていない組は [0, 0] (本来の位置)
 */
export const spreadShifts = (map, groups, pinSize) => {
	const shifts = new Map();
	for (const group of groups) {
		const points = group.map((s) => map.latLngToLayerPoint([s.lat, s.lng]));
		const overlapping = points.every((p) => p.distanceTo(points[0]) < pinSize);
		const center = points
			.reduce((sum, p) => sum.add(p), points[0].multiplyBy(0))
			.divideBy(points.length);
		for (const [i, spot] of group.entries()) {
			if (overlapping) {
				// 組の中心から、左右に等間隔で並べる
				const x =
					center.x + (i - (group.length - 1) / 2) * pinSize * SPREAD_RATIO;
				shifts.set(spot.id, [x - points[i].x, center.y - points[i].y]);
			} else {
				shifts.set(spot.id, [0, 0]);
			}
		}
	}
	return shifts;
};
