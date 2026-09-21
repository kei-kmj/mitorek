---
name: mitorek-hono-route
description: mitorek リポジトリで Hono のルーター・モデル・スキーマ（routes/ models/ schemas/）を追加・変更するときの書き方。API エンドポイントの追加、hono-openapi / ArkType / Drizzle(D1) を使うコード、`route()` ヘルパ、近傍検索や絞り込みの SQL に関わる作業では必ずこのスキルを参照すること。「ルーターを足して」「エンドポイントを作って」「モデルに関数を追加」「スキーマを定義」といった依頼で使う。
---

# Hono ルーターの書き方（mitorek）

routes/spots.ts・models/spots.ts・schemas/spots.ts が雛形。新しいリソースは同じ 3 ファイル構成で、references/ の写しとして書く。

## 構成

```
src/routes/<resource>.ts   app.get(path, ...route({...}, deps => …)) の並び。薄いハンドラのみ
src/models/<resource>.ts   SQL を持つ関数。(db, userId, params) => rows
src/schemas/<resource>.ts  ArkType。入力(Query/Param/Body)と出力(Response)を値と型の両方で export
src/schemas/geo.ts         Latitude / Longitude / RadiusM / BoundingBox / GeoPoint（値オブジェクト）
src/lib/route.ts           describeRoute + validator + 依存注入をまとめた包み。改造しない
src/lib/geo-sql.ts         haversineM / withinBbox（近傍系 SQL の共通式）
```

## ルーター（routes/）の規則

1. **固定パスをパラメータ付きより先に登録する。** `/nearby` は `/:id` より前。Hono は照合は一発でも実行は登録順。
2. **1 ルート 1 目的。** クエリの有無でハンドラの仕事を変えない。別の仕事なら別パスにする。
3. ハンドラは `route()` の第 2 引数の関数だけ。`describeRoute` / `validator` / `drizzle()` / `c.json()` を直接書かない。
4. 正常系は戻り値を返すだけ。404・409 は `HTTPException` を throw（`onError` が JSON にする）。作成系は `status: 201`。
5. `db` と `userId` は注入されるものを使う。`c.env.DB` を直接触らない。
6. 認可: `userId` を受け取らないモデル関数を呼ばない。他人の資源・不存在はどちらも 404。

## スキーマ（schemas/）の規則

- 入力の解析・既定値・範囲チェックは ArkType の morph（`.pipe()` / `"string.numeric.parse"`）に置く。ハンドラには検証済みの意味のある型だけ渡す（例: `bbox` は文字列でなく `{west,south,east,north}`、`r` は既定 2000 が適用済み）。
- 緯度経度・半径・矩形は `schemas/geo.ts` の値オブジェクトを使う。素の `number` にしない。
- 出力スキーマも ArkType で定義し、`resolver()` に渡して OpenAPI に載せる。一覧と詳細で形が違うなら `Detail = Base.and({...})` で拡張する（Base は触らない）。
- 値と型を同名で持つ: `export const Spot = type({...}); export type Spot = typeof Spot.infer`

## モデル（models/）の規則

- 関数は `(db, userId, params)`。SQL は `sql` テンプレートか Drizzle のクエリ。
- 「訪問済み」の定義は `visitedBy(userId)` の 1 式から導く（列にも条件にも同じ式）。
- 絞り込み条件は対応表 `filters: { [K in keyof Query]-?: (v, userId) => SQL }` に 1 行足す。スキーマに項目を足して表に足し忘れるとコンパイルが落ちる形を保つ。
- 距離計算は `lib/geo-sql.ts` の `haversineM(center, latCol, lngCol)`。SQL に Haversine を直書きしない。
- `retired_at IS NULL` を既定条件に含める。
- D1 に対話型トランザクションはない。複数文は `db.batch([...])`。「読んで判断して書く」は SQL 側で完結させるか、JS で全文を組み立ててから batch。
- 戻り値は `undefined` あり得るなら `find*`、必ずあるなら `get*`。

## 新しいリソースを足す手順

1. `schemas/<resource>.ts` に入力と出力を書く（geo.ts の値オブジェクトを再利用）
2. `models/<resource>.ts` に関数を書く（references/models-spots.ts を写す）
3. `routes/<resource>.ts` を書き、`routes/index.ts` で `api.route("/<resource>", …)` に追加
4. `wrangler dev` で `/api/docs` を開き、追加したルートが OpenAPI に載っていることを確認（`route()` を通していれば載る）
5. モデル関数の Vitest（`@cloudflare/vitest-pool-workers`、ローカル D1）を 1 本以上

## 抽象化の方針（最初はシンプルに）

- 抽象化は今ある 2 つ（`lib/route.ts` の包み、モデルの絞り込み対応表）だけ。サービス層・リポジトリのインターフェース・汎用 CRUD ヘルパは作らない。
- **同じ形のコードが 2 回目に現れたら、その場で共通化せず、ユーザーに知らせる。** 「〜が routes/spots.ts と routes/trips.ts で同じ形です。共通化するか、このまま重複を許すか」と提示し、判断を仰ぐ。3 回目でも同じ。
- 知らせるときは、重複している箇所（ファイルと関数名）と、共通化した場合の関数名・置き場所の案を 1 つだけ添える。案を複数並べない。
- ユーザーが「このまま」と言ったら、以後その重複については再度知らせない。
- 例外: 純粋関数に切り出せるロジック（並べ替え→legs 差分、URL 生成、距離計算）は、1 回目から `lib/` に置いてよい。これは抽象化ではなくテスト可能にするための分離。

## 参照

- `references/routes-spots.ts` — ルーターの雛形
- `references/models-spots.ts` — モデルの雛形（対応表・visitedBy・haversineM の使い方）
- `references/schemas-spots.ts` / `references/schemas-geo.ts` — スキーマと値オブジェクト
- `references/lib-route.ts` — `route()` 包みの実装（読むだけ。変更時はまず相談）
- `references/lib-geo-sql.ts` — `haversineM` / `withinBbox` の実装。D1 の `radians` /
  `asin` / `pow` / `sqrt` で動くことをローカル D1 の実データで確認済み
