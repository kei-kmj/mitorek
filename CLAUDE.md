# mitorek

訪問対象を登録して取りこぼしを防ぐ旅程ツール。経路は外部（ジョルダン等）で決め、
**決めた結果をここに記録する**。経路探索そのものはしない。

目的・機能一覧・フェーズは `docs/design.md`。作業前に該当節を読む。

## 技術構成

Cloudflare Workers + Hono / D1 / R2。Drizzle ORM、ArkType、hono-openapi、Vitest
(`@cloudflare/vitest-pool-workers`)。パッケージマネージャは npm。

## Biome が厳しい

`preset: all` + nursery + drizzle/test/types ドメイン。踏みやすいものを挙げる。

- **バレルファイル禁止**（`noBarrelFile` / `noReExportAll`）。`index.ts` で再 export しない
- **`import * as` 禁止**（`noNamespaceImport`）。名前付き import で個別に束ねる
- **1 ファイル 300 行まで**（`noExcessiveLinesPerFile`）。超えたら分割する
- **オブジェクトのキーはアルファベット順**（`useSortedKeys`）。`src/db/schema/**` だけ除外
  （テーブルの列順が壊れるため）
- `src/index.ts` と `*.config.*` は `noDefaultExport` を除外済み（Workers が要求するため）

編集後は PostToolUse フックが `biome check --write` を自動実行する。`npm run lint` が
exit 0 になるまで直す。

## DB

スキーマは `src/db/schema/*.ts` が正。SQL を手で書かない。

```bash
npm run db:generate       # schema 編集後。migrations/ に反映
npm run db:migrate:local  # ローカル D1 に適用
npm run db:export         # data/mitorek-data.sql にデータを退避
npm run db:restore:local  # ダンプから復元
```

- **リモート D1（`db:migrate:remote` / `db:restore:remote`）は不可逆。**実行前に必ず確認を取る
- ローカル D1 を消す前に `npm run db:export`。消すと手入力データが失われる
- リモート未適用の間は `migrations/0000_*.sql` を作り直してよい（`rm -rf migrations` →
  `db:generate`）。適用後は追加マイグレーションのみ
- `scripts/` `seeds/` `data/` は git 管理外。手元にだけある
- **テーブルを作り直すマイグレーション（CHECK の変更など）は、生成されたまま当てない。**
  drizzle-kit の `PRAGMA foreign_keys=OFF` は D1 では効かず（`defer_foreign_keys` でも同じ）、
  `DROP TABLE` が `ON DELETE CASCADE` で子の表を消す。子の表を退避して戻す形に手で直し、
  `test/migrations.test.ts` の形で行が残ることを確かめてから当てる（例: `migrations/0001_*.sql`）

## キー設計

| 種類 | キー |
|---|---|
| 自分で決められるマスタ | 自然キー。`games.id='dqw'`, `collections.id='dqw.castle'`, `prefectures.code='JP-20'`, `rail_categories.code='11'` |
| 外部データ由来 | ULID + `UNIQUE(source, source_code)`。`stations`, `lines`, `rail_operators` |
| 個人データ・同名がありうるもの | ULID。`users`, `visits`, `trips`, `spots` |

ULID は Worker 側で `ulidx` で生成する。

## 守ること

- **個人データは全て `user_id` を持つ。**クエリに `user_id` を必ず含める
- **未来の行動は公開しない。**宿・切符・`legs.url` / `legs.memo`・`stops.approach_memo`・
  自宅圏内の stop は公開処理で落とす
- **導出できる列は持たない。**地方は `prefectures.region_id` 経由、`legs` の日は
  `stops.day_id` 経由
- **ゲーム素材（画像・ロゴ・アイコン）は使わない。**アイコンは Unicode 絵文字のコードポイント
- 外部データを足したら、生成する SQL の先頭に出典 URL をコメントで書く

## データ投入時に必ず確認する

件数 / 外部キーの孤児 / **座標の範囲**（日本 lat 20-46・lng 122-154、台湾 lat 21.5-26.5・
lng 118-122.5）/ 必須列の欠損。座標範囲の確認を落として見逃した実績がある。

## 背景実行

`run_in_background` のコマンドを `| head` などに繋がない。パイプ先が終了した時点で
SIGPIPE で死に、「完了」と誤報告される。出力はファイルにリダイレクトする。
