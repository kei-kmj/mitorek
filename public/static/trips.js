// 旅程の一覧 (src/pages/trips.tsx): 新しい旅程を作って、その編集画面へ移る
import { sendJson } from "./dom.js";

const CREATED = 201;

const form = document.getElementById("new-trip");
const error = document.getElementById("new-trip-error");

form.addEventListener("submit", async (e) => {
	e.preventDefault();
	error.textContent = "";
	const data = Object.fromEntries(new FormData(form));
	const { json, status } = await sendJson("POST", "/api/trips", data);
	if (status === CREATED) {
		globalThis.location.href = `/trips/${json.id}`;
		return;
	}
	error.textContent = json.error?.message ?? `作れませんでした (${status})`;
});

// ホームの「新しいおでかけプランを作る」から来たら、すぐタイトルを入力できるようにする。
// #new-trip へのスクロールの後でないとフォーカスが外れるので、読み込みが終わってから
if (globalThis.location.hash === "#new-trip") {
	globalThis.addEventListener("load", () => {
		form.querySelector('input[name="title"]')?.focus();
	});
}
