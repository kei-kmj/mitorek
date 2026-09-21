# mitorek（ミトレク）設計メモ v0.1

名前: mitorek（未踏 + trek）。表示名は「mitorek」、日本語表記「ミトレク」。ロゴは人の足跡（未訪問=輪郭、訪問済み=塗り）。地図ピンは絵文字で、訪問済みをグレーアウトする（ロゴとは別の表現）。リポジトリ・パッケージ: `mitorek`

## 目的

既存ツール（みんドラ・ゲーム本体）でできないことを埋める。

| できること | みんドラ | ゲーム本体 | このアプリ |
|---|---|---|---|
| ポイント一覧・位置 | ○ | △（近くのみ） | ○（自己転記） |
| 訪問済みチェック | ○（端末保存） | ○（ぼうけんロード） | ○（日付・位置付き） |
| 未訪問だけ地図に出す / 種別で切替 | × | × | ○ |
| 全国・地方・県・路線での未到達数 | × | △（訪問数のみ） | ○ |
| 旅程（日・順序・時刻） | × | × | ○ |
| 旅程に沿った近傍未到達の検出 | × | × | ○ |
| 区間の経路リンク・経由地URL生成 | × | ×（目的地1点） | ○ |
| 終了後の記事化（非公開情報を除外） | × | × | ○ |

## 方針

- 共有マスタと個人データを分離。個人データは全て `user_id` を持つ（初日からマルチテナント）。
- マスタの名称は、城・里はゲーム内/公式で確認できる名称、お土産は公開されている攻略情報を参考に作成（ゲーム内図鑑には未取得のランドマーク名が出ないため）。座標は攻略サイトから取らず、住所・施設名から独自にジオコーディング → 訪問時 GPS で上書き。出所は about に事実どおり記載。
- 未来の行動（旅程・宿・区間）は常に非公開。公開できるのは記事と、丸めた過去の記録のみ。
- 自宅圏（`users.home_*`）内のポイント・写真・stop は公開処理で除外または県名まで丸める。
- ゲーム素材（画像・ロゴ・アイコン）は使わない。名称は文字のみ。非公式と明記。
- DQW は共有コレクションの一つ。アプリ自体は「訪問対象を登録して取りこぼしを防ぐ旅程ツール」。
- フロントは Hono の JSX で SSR。地図ページなど動く部分だけ `hono/jsx/dom` で島化。地図は Leaflet + 地理院タイル（淡色地図）を不透明度 60% で敷く。標準地図の陰影・地形の色分けが無く、残る等高線・標高点も不透明度で目立たなくする。駅名は背景地図のものを使い、自前では重ねない（自前の駅は点だけ。クリックで路線と「近くのスポットを探す」を出す）。登録不要で利用上限も無い。検討して見送った案: 標準地図を不透明度 50%（陰影・標高が邪魔）、Esri（現行版は ArcGIS 登録と API キーが必要、旧 World Street Map は更新停止）、Google Maps（請求アカウント必須、Map Tiles API は無料枠 月 10 万枚）、MapLibre + 地理院ベクトルタイル。Astro は記事機能が肥大したときに前段へ足す案として保留。

## 機能一覧 → テーブル対応

### F1 コレクションとスポット
- `games`：プリセットの束（`dqw` 等）
- `collections`：フラット。城／お土産／まものランド／里の4行がアイコン・カウントの単位。今は共有プリセットのみ（ユーザー作成・公開設定は将来追加）。PK は自然キー（`dqw.souvenir`）。`games` / `prefectures` も自然キー。外部サービス由来の ID（認証基盤の user id、駅データのコード）は PK にせず UNIQUE 列に分離し、`spots` / `stations` / `lines` / 個人データは ULID
- `spots`：ゲーム内スポット 1 行。`collection_id` を 1 つ持ち、お土産のシーズンは `group_key` 列。同じ施設でも別スポットなら別行（姫路城の名城／お土産）。JSON 属性は持たず、`reward`（お土産名）・`note`（季節事情）を列で持つ
- 座標の出所（`coord_source`: geocode / manual / gps。gps は自分の `visits` の座標で上書きしたもの）、廃止は `retired_at` の論理削除
- 公式URLは NULL 可、後から埋める（OGP リンクカード用）
- アイコンは Unicode 絵文字をコードポイントで `collections.icon` に持ち、SVG セット（Twemoji 等）を自前配信。ゲーム素材は使わない
- 色はマスタに持たない。塗り分け軸（コレクション／グループ／訪問状態／難易度）は表示設定で切り替え、パレットはアプリ側。今の地図のピンは色を使わず、コレクションの絵文字だけを出す（訪問済みはグレーアウト）
- 名称は `spots.name` にゲーム（日本語版）の表示名をそのまま持つ。多言語表記の表は作らない（必要になれば後から足せる）
- 行政区は `prefectures`（国＋都道府県／県市）。地方は `prefectures.region_id` → `regions`（自然キー）で導出し、spots には持たない。三重=近畿のようなゲーム内区分は prefectures 側の値で表す
- テーブル: `games`, `regions`, `collections`, `spots`, `prefectures`
- コレクションの購読（表示・警告の対象を利用者ごとに選ぶ）は他プリセットを足す時点で `collection_subscriptions` として追加する。今は全コレクションが対象

### F2 訪問記録
- スポット単位で記録（同じスポットに複数回可）
- 過去分の一括登録（日付不明を許す）
- 訪問時の GPS は `visits.lat/lng` に保存。自分のマスタ座標の上書きに使う。他利用者の実測を共有マスタに集める仕組み（`spot_gps_samples`、同意付き）は公開時に追加
- 訪問写真は `visit_images`（R2 キー・キャプション・順序。EXIF 除去済み）
- テーブル: `visits`, `visit_images`

### F3 未到達カウント
- 国 / 地方 / 県：`spots` × `visits` × `prefectures` の GROUP BY。コレクション別は `collections` の階層を辿って集計
- 路線：`spot_stations` × `station_lines` 経由の近似（一定距離内の駅に多対多で紐付け）
- 分母は自前マスタを正とする。外部サイトの数と一致しなくてよい
- `rail_categories`：鉄道区分（国土数値情報の RailwayClassCd をそのまま自然キーに。`lines.category_code` から参照）。最寄り駅の候補から鋼索鉄道（ケーブルカー）等を除くための絞り込み軸。アイコンは持たない（駅は複数路線にまたがるため区分から一意に引けない。表示側のマッピングで持つ）
- テーブル: `rail_categories`, `rail_operators`, `lines`, `stations`, `station_lines`, `spot_stations`

### F4 旅程
- `trips` → `days` → `stops`（地点の列。spot / station / custom_place のどれか 1 つを FK で参照）と `legs`（stop 間の移動：手段・出発/到着時刻・経路URL）
- ホテル・駐車場などは `custom_places`（利用者定義の地点）に 1 回登録し、複数の stop から再利用（1 日目の終点と 2 日目の始点が同じホテル）
- `days` は `date` が順序を兼ねる（`seq` なし、`UNIQUE(trip_id, date)`）
- 1 日は「駅 → 移動 → スポット → 移動 → … → 駅 or ホテル」の交互列として表す
- 並べ替えで seq を振り直し、legs と自動生成リンクを再生成
- `trips.status` は人が決める状態のみ（planning / confirmed / postponed / cancelled）。進行中・終了は日付から導出、実際に行ったかは visits。延期中は日付 NULL 可
- `trips.visibility`（private / unlisted / public）。`end_date` が過去のときだけ公開に変更できる。公開画面では宿・切符のリンク、`legs.url` / `legs.memo`、`stops.approach_memo`、自宅圏内の stop を落とす（未来の行動は出さない、の原則はそのまま）
- テーブル: `trips`, `days`, `stops`, `legs`, `custom_places`

### F5 近傍未到達の検出
- 中心（stop または最寄り駅）と半径から、未訪問スポットを列挙（コレクションの絞り込みは表示側のフィルタ）
- stop 追加時の警告と、旅程確定時の「取りこぼしチェック」で同じクエリを使う
- 矩形絞り込み → Haversine。直線距離であることを表示に明記
- 追加テーブルなし（`spots`, `visits` で完結）
- `spot_stations` は半径で絞らず近い順に 3 駅。ただし最寄りが 40km を超えるスポットは 1 件も入れない（離島。対岸の駅を最寄りと呼んでも使えないため）。距離だけでは沖縄本島北部（48〜87km）と離島を区別できないので、「その駅から現実的に行けるか」の線引きとして割り切っている

### F6 リンク
- 自動生成：Google マップ経由地URL（day 単位、`links.kind='route'`）、ジョルダン（`legs.url`）
- 手入力：えきねっと・レンタサイクル・宿など。紐付け先は trip 全体 / day / stop の FK のどれか 1 つ（多態参照はやめた。3NF のため trip_id は day/stop と同時に持たない）。移動の経路リンクは `legs.url`
- 予約確認URLはセッション依存が多いので、予約番号とサイト名をメモに
- テーブル: `links`

### F7 記事
- trip 終了後に visits / stops / memo から下書き生成。宿・区間・`approach_memo`・時刻・出発駅は含めない
- 冒頭は最初の stop の最寄り駅から。自宅圏内の stop は県名まで
- 公開範囲 private / unlisted / public。`publish_after` で旅程終了前の公開を禁止
- 画像は R2、アップロード時に EXIF 除去（公開・非公開を問わず）。記事は `visit_images` を参照して並べる（記事専用の画像表は持たない）
- テーブル: `posts`（フェーズ 4 で追加。`visit_images` を参照）

### F8 認証・利用者
- better-auth + Google。`users.id` は自前 ULID、認証基盤の ID は `users.auth_user_id` に分離（基盤を差し替えても業務側の FK に影響しない）。`users.status` の allowlist で当面は自分だけ
- 全クエリに `user_id` を強制するミドルウェア
- 公開時に Turnstile・利用規約・プライバシーポリシーを追加
- テーブル: `users`

## 技術構成（確定）

- ランタイム：Cloudflare Workers ＋ Hono。D1（DB）、R2（写真）。`nodejs_compat`
- ORM／マイグレーション：Drizzle ORM（D1 ドライバ）。`schema.ts` を正とし、`drizzle-kit generate` → `wrangler d1 migrations apply`
- API：`hono-openapi`（`describeRoute` ミドルウェア）＋ ArkType（Standard Schema）。スキーマは `schemas/` に集約し、`validator('json', Schema)` と `resolver(Schema)` に同じ定義を渡す。`/api/openapi.json`、`/api/docs`。`describeRoute` を付け忘れたルートは仕様に載らないので、routes のレビュー項目にする
- フロント：`hono/jsx` の SSR。地図ページは Leaflet（CDN）＋素の script。Vite は入れない（島が増えたら `@hono/vite-build` を検討）
- テスト：Vitest ＋ `@cloudflare/vitest-pool-workers`（ローカル D1 込みで `app.request()`）
- 認証：better-auth（Drizzle アダプタ）＋ Google。`users.id` は自前 ULID、`auth_user_id` に分離。詰まったら Cloudflare Access に切替
- 実装順：地図（全スポット表示）→ 訪問登録と絞り込み → 未到達カウント → 旅程 → 認証

## 横断的な決め事

- 環境：ローカル（`wrangler dev` のローカル D1）と本番の 2 つ。本番 DDL は `wrangler d1 migrations apply --remote` のみ
- 日時：`*_at` は UTC の ISO 8601（D1 の `datetime('now')`）、表示で JST。`days.date`（YYYY-MM-DD）と `HH:MM` は現地の暦日・時刻でタイムゾーンを持たない
- ID：ULID を Worker 側で生成（`ulidx` 等）
- エラー：`app.onError` で `{ error: { code, message } }`。検証（ArkType の失敗）400 / 認可 403 / 他人の資源・不存在は 404（存在を漏らさない）
- 画像：EXIF 除去は Worker 内で JPEG の APP1 を落とす（`lib/exif.ts`）。除去後に R2 へ
- 秘密情報：`wrangler secret put`。バックアップは `wrangler d1 export` を当面手動

## ディレクトリ構成（確定）

```
src/
  routes/       spots.ts, trips.ts, visits.ts, stats.ts, places.ts, stations.ts, index.ts（束ねる）
                app.get + describeRoute + validator。薄いハンドラのみ（コントローラクラスは作らない）
  models/       routes と同名。SQL を持つ関数 (db, userId, params) => rows。Drizzle / sql テンプレート
  pages/        画面 1 枚 = 1 ファイル。home.tsx, map.tsx, spot.tsx, trips.tsx, trip.tsx, stats.tsx, public-trip.tsx
  components/   layout.tsx, spot-card.tsx, marker-icon.tsx など共通部品
  schemas/      ArkType。API の入出力型。routes 間で共有
  lib/          純粋関数。geo.ts（Haversine）, urls.ts（Google / ジョルダン URL）, itinerary.ts（並べ替え→legs 差分）
  db/schema/    Drizzle のテーブル定義（正）
```

URL 設計は API 節（`/api/...`）と画面（`/`（ホーム: 到達状況と各画面への入口）, `/map`（地図）, `/spots/:id`, `/stats`, `/trips`, `/trips/:id`, `/trips/:id/check`, `/visits`, `/p/:tripId`）。`/places` の画面は持たず、旅程エディタから custom_places を作る。

## フェーズ

| フェーズ | 内容 | 時期 |
|---|---|---|
| 0 | マスタ転記・ジオコーディング・駅データ整形・スキーマ確定 | 完了 |
| 1 | D1 投入、F5 近傍クエリ、F3 全国/地方/県カウント（API のみ） | 連休 1日目 |
| 2 | F4 旅程 CRUD、F6 自動生成リンク | 連休 2〜3日目 |
| 3 | F5 stop 追加時の警告、地図、F2 訪問登録 | 連休 4〜5日目 |
| 4 | F7 記事、F3 路線別、写真、OGP カード、AI 旅程生成 | 連休後 |
| 5 | 公開準備（規約・Turnstile・提案テーブル・他プリセット） | 使ってみてから |
| 6 | 台湾プリセット（TDX 駅データ・Nominatim）、UI 多言語、共有（F9）、訪問難易度 | 予定が見えてから |

### F9 共有（後々）
- `trip_members(trip_id, user_id, role)` と `trip_invites(token, ...)`。trips 系の認可を trip スコープに切替
- 近傍検出の「誰にとっての未訪問か」は全員の和集合をデフォルト
- 同時編集に備え、旅程 API は最初から `updated_at` による楽観ロック

### F10 訪問難易度（後々）
- 計算値: 最寄り駅距離・駅有無・路線数から「駅徒歩圏 / 駅近 / 駅なし」の3段階
- 人の評価: `visits.difficulty`（1〜5）と `visits.by_car`。季節別に集計し、表示は max
- 季節事情は `spots.note` に自由記述（AI 旅程生成にも渡す）

## 公開時のデータ出所表記（案）

- 城・ご当地の里：ゲーム内の一覧および公式サイトの情報に基づく
- お土産・まものランド：公開されている攻略情報を参考に名称を作成。ゲーム内の図鑑には未取得のランドマーク名が表示されないため、現地で未確認のものを含む
- 座標：施設の住所・名称から国土地理院 地名検索 API および OpenStreetMap（© OpenStreetMap contributors, ODbL）で独自にジオコーディング。利用者の訪問時の位置情報により順次補正
- 背景地図：地理院タイル 淡色地図（国土地理院）
- 駅・路線：国土数値情報 鉄道データ（国土交通省）。駅の都道府県は国土地理院 逆ジオコーダで付与
- 住所・公式リンク：各施設・自治体の公開情報
- スクウェア・エニックス株式会社とは無関係の非公式ツール。ゲーム内の画像・素材は使用しない

## 将来の拡張方針（表を「広げる」のではなく「足す」）

- 高速道路：`expressways` / `expressway_ics` を別表で追加し、`stops.ic_id`（NULL 可 FK、`station_id` と排他）と `spot_ics`（最寄り IC）を足す。`stations` は駅専用のまま変えない
- 記事：`posts` を追加し、写真は `visit_images` を参照
- 購読・共有・他利用者実測：`collection_subscriptions` / `trip_members` / `spot_gps_samples` を追加。既存表の変更なし
- 導出できる列は持たない：`links.user_id`（trips 経由）、`legs.day_id`（stops 経由）、`stations.country_code`（prefectures 経由）、`regions.game_id`（県→地方はゲームに依らない）

## 未決事項

1. （解決）区間は `legs` 表。並べ替え時は legs を作り直し、手入力の url / memo が付いた leg は「行き先が変わった」と UI で警告する。
2. 半径のデフォルト値と、stop 中心 / 最寄り駅中心の両方を出すか。実地で決める。
3. `spot_gps_samples` からマスタ座標を更新する集計ルール（中央値・件数閾値）。公開後でよい。
4. お土産の「交換で入手済み＝行かなくてよい」を扱うか。扱うなら `spots` ではなく per-user の skip テーブル。

## 参照

- 国土地理院 地名検索 API: https://msearch.gsi.go.jp/address-search/AddressSearch?q=
- 地理院タイル一覧（淡色地図・利用規約）: https://maps.gsi.go.jp/development/ichiran.html
- 国土地理院 逆ジオコーダ: https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress
- 国土数値情報 鉄道データ: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-v3_1.html
- 国土数値情報 鉄道区分コード: https://nlftp.mlit.go.jp/ksj/gml/codelist/RailwayClassCd.html
- 駅データ.jp: https://ekidata.jp/
- Google Maps URLs: https://developers.google.com/maps/documentation/urls/get-started
- D1 SQL（math 関数）: https://developers.cloudflare.com/d1/sql-api/sql-statements/
- Workers HTMLRewriter（OGP 抽出）: https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/
- Hono JSX / DOM: https://hono.dev/docs/guides/jsx-dom
- DQW 外部マップ連携（Google マップのピン → 目的地）: https://game8.jp/dqwalk/293581
