// 訪問の写真: 縮小して送る・一覧・削除。地図の吹き出しと振り返りで使う
import { el } from "./dom.js";

/** 長辺をこの大きさに縮める。記事に使うのに十分で、容量と通信量を抑える */
const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.85;
const CREATED = 201;

// biome-ignore lint/suspicious/noAlert: 削除の確認だけはブラウザ標準で止める
const ask = (message) => globalThis.confirm(message);

/**
 * 写真を長辺 MAX_EDGE の JPEG にする。撮影時の向きは保つ。
 * 描き直すので、位置情報などの Exif もここで消える (サーバーでも消す)
 */
const toJpeg = async (file) => {
	const bitmap = await createImageBitmap(file, {
		imageOrientation: "from-image",
	});
	const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) {
					resolve(blob);
				} else {
					reject(new Error("変換できません"));
				}
			},
			"image/jpeg",
			JPEG_QUALITY,
		);
	});
};

const upload = async (visitId, file) => {
	const form = new FormData();
	form.append("file", await toJpeg(file), "photo.jpg");
	const res = await fetch(`/api/visits/${visitId}/images`, {
		body: form,
		method: "POST",
	});
	if (res.status !== CREATED) {
		const json = await res.json().catch(() => ({}));
		throw new Error(json.error?.message ?? `送れませんでした (${res.status})`);
	}
};

const thumbnail = (image, onChanged) =>
	el(
		"li",
		{ className: "photo" },
		el(
			"a",
			{
				href: image.url,
				rel: "noopener",
				target: "_blank",
				title: "大きく見る",
			},
			el("img", {
				alt: image.caption ?? "写真",
				loading: "lazy",
				src: image.url,
			}),
		),
		el("button", {
			className: "photo-delete",
			onclick: async () => {
				if (ask("この写真を消します。元に戻せません。")) {
					await fetch(image.url, { method: "DELETE" });
					onChanged();
				}
			},
			textContent: "×",
			title: "写真を消す",
			type: "button",
		}),
	);

/** 訪問の写真の列と「📷 写真を足す」。足した・消したら onChanged() で読み直してもらう */
export const photoStrip = (visit, onChanged) => {
	const status = el("span", { className: "meta" });
	const input = el("input", {
		accept: "image/*",
		hidden: true,
		multiple: true,
		type: "file",
	});
	input.addEventListener("change", async () => {
		const files = [...input.files];
		try {
			for (const [i, file] of files.entries()) {
				status.textContent = `送っています… (${i + 1}/${files.length})`;
				// biome-ignore lint/performance/noAwaitInLoops: 1 枚ずつ送り、進み具合を出す
				await upload(visit.id, file);
			}
			onChanged();
		} catch (error) {
			status.textContent = `写真を送れませんでした (${error.message})`;
		}
	});
	return el(
		"div",
		{ className: "photos" },
		el(
			"ul",
			{ className: "photo-list" },
			...visit.images.map((image) => thumbnail(image, onChanged)),
		),
		el("button", {
			className: "link",
			onclick: () => input.click(),
			textContent: "📷 写真を足す",
			type: "button",
		}),
		input,
		status,
	);
};
