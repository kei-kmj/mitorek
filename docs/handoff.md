# 引き継ぎ資料 (2026-09-21 時点)

何が実装済みで、何がまだかをまとめる。目的・機能の全体像は `docs/design.md`、作業上の決まりは
`CLAUDE.md` が正。この資料はその 2 つとの差分 (今の実装の状態) を書く。

- 読む順: `CLAUDE.md` → `docs/design.md` → この資料
- 画面上の呼び名は「おでかけプラン」。コード・API・設計メモでは trips / 旅程 のまま
- 「未訪問」は画面ではすべて「未踏」と書く

## 動かし方

```bash
npm run dev          # http://localhost:8787 (ローカル D1 / R2)
npx vitest --run     # 25 ファイル・219 テスト (すべて通る)。test/ は src/ と同じ構成
npm run lint         # biome。指摘 0
```

- API 仕様: `/api/docs` (Swagger UI)、`/api/openapi.json`
- 型チェックは `typescript` が devDependencies に無いので `npx -p typescript@5 tsc --noEmit -p .` で回す。
  エラー 0 (`test/env.d.ts` の `/// <reference types="@cloudflare/vitest-pool-workers/types" />` で
  `cloudflare:test` が解決できるようになった)
- テストの `env` は `cloudflare:workers` から取る。`cloudflare:test` の `env` は deprecated

## 実装済み

### 画面

| URL | 内容 |
|---|---|
| `/` ホーム | コレクションごとのコンプリート率 (% は切り捨て、未踏数付き)、最近のおでかけプラン 3 件、「＋ 新しいおでかけプランを作る」、各画面への入口 |
| `/map` 地図 | 全スポットのピン、コレクション・未踏での絞り込み、近くの未踏の検索、駅の表示、スポットの「行った」と写真 |
| `/trips` おでかけプラン一覧 | 一覧と作成フォーム (`#new-trip` で来るとタイトルにフォーカス) |
| `/trips/:id` 編集 | 見出し・日ごとの立ち寄りと移動・地点の検索と追加・振り返り |

### 地図 (F1・F5)

- 背景は Leaflet + 地理院タイル **淡色地図・不透明度 60%**。検討の経緯 (OSM・標準地図・Esri・Google・MapLibre を見送った理由) は design.md
- ピンはコレクションの絵文字だけ (白いふち取りの影)。訪問済みはグレーアウト
- すぐ近く (500m 以内) のスポット同士は、画面上で重なるときだけ横に並べる (`map-spread.js`。ズームのたびに数え直す)
- 駅: ズーム 11 以上で自前の `stations` を白丸で出す (駅名は背景地図のもの)。クリックで路線と「近くのスポットを探す」
- 近傍検索: 地図のクリック、スポット/駅の吹き出しの「近くのスポットを探す」。半径の円、右上の × と左の「クリア」で消せる
- 表示位置を URL (`#zoom/lat/lng`) に保つ (`map-hash.js`)

### 訪問記録と写真 (F2)

- 地図の吹き出しの「行った」: 端末が許せば GPS 座標付きで記録。取り消し・「もう一度行った」
- 写真: 訪問ごとに複数枚。ブラウザで長辺 2048px の JPEG に縮めて送り、サーバーでも Exif (APP1/APP13) を消して R2 に保存 (`lib/jpeg-metadata.ts`)。本人しか見られない (`/api/images/:id`)。訪問を取り消すと R2 の実体も消す
- `visits.visited_at`: 地図の「行った」は UTC の日時、振り返りは日付だけ (YYYY-MM-DD)

### おでかけプラン (F4)

- 作成時に期間分の日を自動で作る (最長 31 日)。延期は日付なしで作れる
- 期間の変更: 日数が同じなら日ごと中身も動く (ずらし)。日数が変わると端で足し引きし、地点入りの日が外れるときは確認
- 状態: 計画中・確定・**終了**・延期・中止 (人が選ぶ。終了は 2026-09-21 に追加)
- 立ち寄り: スポット・駅・自分の地点。↑↓ で並べ替え、時刻 (着・発)・メモ・行き方メモ (非公開)
- 移動: 手段・出発/到着・経路 URL・メモ (2 段目、「＋ メモ」で開く)。並べ替えで URL/メモ入りの移動が消えるときは確認
- 保存は **操作ごとに即時** (見出しだけ「保存」ボタン)。まとめて保存する方式は検討して見送った
- 楽観ロック (F9 に備えて): 変更は旅程の `updatedAt` を送り、古ければ 409 → 画面は読み込み直す
- 振り返り: 開始日 (日本時間) 以降に編集画面の下に出る。スポットの立ち寄りにチェックして「確定」で訪問になる。記録済みは写真を足せる。日本時間の同じ日の訪問は二重に作らない

### 地点の検索

- 名前検索 (`/api/places/search`): スポット・駅・自分の地点。ひらがな/カタカナの違いと長音・空白・中黒は無視。「〇〇駅」は末尾の「駅」を外して駅を探す。スポットはふりがな (`name_kana`) でも当たる
- 住所・施設名 (`/api/places/geocode`): 国土地理院 地名検索 (住所) と OpenStreetMap Nominatim (施設名) を同時に引き、自分の地点 (宿・駐車場・その他) として登録。Nominatim は規約によりボタン押下時だけ呼ぶ
- 施設名の補足は「県 + 市区町村 + 町名 (+ 番地)」、チェーン店は支店名を足す

### API の一覧

`GET /api/openapi.json` が正。2026-09-21 時点:

- collections: `GET /api/collections`
- spots: `GET /api/spots`, `GET /api/spots/nearby`, `GET /api/spots/{id}`
- stations: `GET /api/stations?bbox=`
- places: `GET /api/places/search`, `GET /api/places/geocode`, `POST /api/places`
- trips: `GET/POST /api/trips`, `GET/PATCH/DELETE /api/trips/{id}`
- stops/legs: `POST .../days/{dayId}/stops`, `PUT .../days/{dayId}/order`, `PATCH/DELETE .../stops/{stopId}`, `PUT/DELETE .../stops/{stopId}/leg`
- review: `GET/POST /api/trips/{id}/review`
- visits: `GET/POST /api/visits`, `DELETE /api/visits/{id}`
- images: `POST /api/visits/{id}/images`, `GET/DELETE /api/images/{id}`

エラーはすべて `{ error: { code, message } }` (入力エラーの 400 も `route()` の中で揃えている)。

## まだしていないこと

design.md のフェーズ・機能番号に沿って。

| 機能 | 状態 |
|---|---|
| F3 全国・地方・県別の未到達数、路線別の数 | 未着手 (ホームはコレクション別の率だけ) |
| F5 立ち寄りを足したときの取りこぼし警告、「取りこぼしチェック」画面 (`/trips/:id/check`) | 未着手 (近傍検索 API はある) |
| F6 リンク (Google マップの経由地 URL の自動生成など、`links` 表) | 未着手 (表だけある) |
| 地図の吹き出しからおでかけプランに足す | 未着手 (旅程一覧 API は日付き。作る予定だった「4 段階目」) |
| スポットの一覧 (全部 / 未踏のみの切り替え) | 形が未決。案 A: ホームの中で開く / 案 B: コレクションごとのページ / 案 C: 全スポットの一覧ページ |
| F2 過去分の一括登録 (ゲームで取得済みの分) | 未着手 |
| F7 記事 (`posts`)・公開 (visibility)・自宅圏の除外 | 未着手 |
| F8 認証 (better-auth + Google) | 未着手。今は `DEV_USER_ID` の仮の利用者 (下記) |
| `/spots/:id`, `/stats`, `/visits` の画面 | 未着手 |
| F9 共有 (ほかの人を招待して一緒に編集) | 未着手。`trip_members` / `trip_invites` を足し、認可を旅程単位に切り替える (design.md F9)。F8 認証が先。楽観ロックは入っている |
| Google カレンダー連携 | 未着手 (design.md「将来の拡張方針」)。購読用の ICS URL を配る案 (OAuth 不要) か、Google Calendar API で書き込む案 (F8 の認証が先) |

## 次の作業: F8 認証 (2026-09-22 から)

design.md F8: better-auth + Google。`users.id` は自前の ULID のまま、認証基盤の ID は `users.auth_user_id` に分ける。
当面は `users.status` の allowlist で本人だけ。

**始める前に用意するもの (ユーザー側)**
- Google Cloud Console で OAuth 同意画面と OAuth クライアント ID (ウェブアプリ) を作る
- 承認済みリダイレクト URI: `http://localhost:8787/api/auth/callback/google` (本番のドメインは決まったら追加)
- クライアント ID / シークレットは `.dev.vars` (ローカル、git 管理外) と `wrangler secret put` (本番) に置く。リポジトリに書かない

**進め方の案**
1. better-auth の表 (session / account / verification など) をスキーマに足す。既存の `users` と役割がぶつからないよう、認証基盤の user は `auth_user_id` で結び付ける形を先に決める
2. 今の仮の利用者の行 (`01M31AGK3ABN7NF1P12QJVYGQ0`) に、自分の Google アカウントの `auth_user_id` を結び付けて、手入力のデータを引き継ぐ
3. `lib/deps.ts` の `DEV_USER_ID` をやめ、セッションから `userId` を積むミドルウェアに差し替える。未ログインは画面ならログインへ、API なら 401
4. `users.status` が active の人だけ通す (allowlist)
5. `wrangler.jsonc` の `vars.DEV_USER_ID` を消す

**注意**
- マイグレーションが増える。テーブルを作り直すものは CLAUDE.md の注意どおり、生成されたまま当てない
- リモート D1 へのマイグレーション (0001 を含む) は取り消せないので、当てる前に必ず確認を取る
- 認証が入るまでは本番に出さない

## 既知の問題・保留

- **見出しの書きかけが消える**: 見出しを書き換えて「保存」を押す前に、地点の追加など別の操作をすると描き直しで元に戻る
- **タイトル欄が狭い**: 長いタイトルが途中で切れて見える
- **施設名検索が弱い** (design.md 未決事項 5): OSM は正式名称・網羅とも弱い。住所で探して名前を書き換えれば当面は足りる。次の候補は Google (地図ごと移行が必要) か楽天トラベル
- **ヘッダーの説明文**「非公式・個人用の旅程ツール」の扱いが未決
- **重複の共通化は保留** (ユーザー判断待ち。スキル mitorek-hono-route の「2 回目で知らせる」):
  `keyed()` (trip-render / trip-leg / trip-search)、`ask()` (trip / photos / map-visits)。
  テストの準備データは `test/fixtures.ts` にまとめた (2026-09-27)
- **スキルとのずれ**: `lib/route.ts` を雛形から拡張した (型の直し、400 の形、`bodyFormat: "form"`、`binary`)。
  駅・コレクションなど共有マスタのモデルは `userId` を取らない。`references/lib-route.ts` は未更新 (models-spots / lib-geo-sql は 2026-09-27 に更新)

## データと環境の状態

- **仮の利用者**: `wrangler.jsonc` の `vars.DEV_USER_ID = 01M31AGK3ABN7NF1P12QJVYGQ0`。ローカル D1 の `users` に同じ行
  (`dev@localhost.invalid`)。認証を入れたら、この行に `auth_user_id` を結び付けてデータを引き継ぐ
- **ローカル D1** にユーザーの手入力データがある (おでかけプラン「関西とり尽くす」、訪問、自分の地点)。
  消す前に `npm run db:export`。最新の退避は `data/mitorek-data.sql`
- **マイグレーション**: `0001_*.sql` (trips.status に completed を足す作り直し) は**ローカルだけ適用済み、リモート未適用**。
  子の表を退避して戻す形に手で直してある。生成されたままだと days / stops / legs / links が消える (CLAUDE.md、`test/db/migrations.test.ts`)
- **スポットのふりがな**: `seeds/0012_spot_kana.sql` (Sudachi で自動生成) → `seeds/0013_spot_kana_fix.sql` (手直し 11 件) の順に流す。
  生成は `scripts/spot_kana.py`、手直しは `data/spot_kana_review.tsv` を直して `scripts/spot_kana_fix.py`。
  いずれも git 管理外 (手元だけ)。まものランドのアイコンは 🦄 (`1f984`) に変更済み (seeds・退避データも)
- **外部サービス** (実行時に呼ぶ): 地理院タイル、国土地理院 地名検索、OpenStreetMap Nominatim (User-Agent はアプリ名のみ)
- **本番**: まだデプロイしていない。認証が無いので、おでかけプラン (未来の行動) を扱う以上、認証前に公開しない

## コミットの状況

最後のコミットは `e8cae0b おでかけプランページ`。それ以降の次の変更は**未コミット**:
訪問記録 (地図の「行った」)、写真、振り返り、ピンを並べる処理、状態「終了」とマイグレーション 0001、
期間をずらすと日ごと動く修正、ヘッダーの拡大、テーマまわり、「未踏」への言い換え、ホームのコンプリート率とおでかけプラン、
この資料・CLAUDE.md・design.md の更新。
