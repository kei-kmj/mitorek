// 画面の script で共有する小さな部品

const METERS_PER_KM = 1000;
const KM_DIGITS = 1;

/** 要素を組み立てる。文字は textContent で入れ、innerHTML は使わない */
export const el = (tag, props = {}, ...children) => {
	const node = Object.assign(document.createElement(tag), props);
	// 条件付きの子 (cond && el(...)) の false / "" / undefined は落とす
	node.append(...children.filter(Boolean));
	return node;
};

export const formatKm = (m) => `${(m / METERS_PER_KM).toFixed(KM_DIGITS)} km`;

export const getJson = async (url, init) => {
	const res = await fetch(url, init);
	if (!res.ok) {
		throw new Error(`${res.status} ${url}`);
	}
	return res.json();
};
