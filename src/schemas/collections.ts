import { type } from "arktype";

// ---- 出力 ----
/** コレクションと、利用者ごとの到達状況 (廃止スポットは数えない) */
export const Collection = type({
	/** 絵文字コードポイント ('1f3ef')。色は持たない */
	icon: "string | null",
	id: "string",
	name: "string",
	total: "number.integer >= 0",
	visited: "number.integer >= 0",
});
export type Collection = typeof Collection.infer;
