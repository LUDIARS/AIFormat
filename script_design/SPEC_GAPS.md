# SPEC_GAPS — 仕様欠落シグナル収集 (check-spec-gaps.mjs)

| 項目 | 値 |
|------|-----|
| 区分 | **Anatomia 計装** (report-only。該当性判断は LLM に残す) |
| 対応レビュー観点 | [`common/REVIEW_QUALITY.md`](../common/REVIEW_QUALITY.md) §3 ドキュメント充実度 |
| 対応プロンプト | [`prompt/SPEC_GAP.md`](../prompt/SPEC_GAP.md) — 本スクリプトは Phase A (シグナル収集)・Phase B (突合) の決定的部分を機械化し、Phase C (該当性判断)・D (生成) はプロンプトが担う |
| 状態 | 設計 (実装は Anatomia 側) |

## 目的

「実装にあるのに spec に無い」候補を機械で列挙し、SPEC_GAP プロンプトと
デイリーレビューの**入力**にする。LLM の検索漏れ (Phase A の抜け) を構造的に防ぎ、
LLM は判断 (Phase C 以降) に集中させる。

## 検知ロジック

FORMAT_SPEC §11 の充実度対象 5 分類について、実装シグナルと spec 記載を両方向で突合する。

### シグナル収集 (分類 → 検出対象)

| 分類 | 検出方法 | 抽出する対象 |
|------|---------|-------------|
| `data` | `migrations/**/*.sql` の `CREATE TABLE` / ORM スキーマ定義ファイル (drizzle・prisma・sqlx 等の既知パス・構文) | テーブル / ストア名 |
| `interface` | ルータ登録 (`app.get(` 等の既知フレームワーク構文) / OpenAPI・proto ファイル / `bin` エントリ・CLI 定義 | メソッド + パス / RPC / コマンド名 |
| `feature` | ルートグループ・ページ / 画面ディレクトリ・コマンド一覧 (フレームワーク既知の規約パス) | 機能候補名 |
| `setup` | `package.json` scripts / Dockerfile / compose / `.env.example` と `process.env.*` 参照 | script 名 / 環境変数名 |
| `test` | テスト設定ファイル / テストディレクトリ / CI のテストステップ | テスト種別 |

### 突合 (kind 一覧)

| kind | 判定 |
|------|------|
| `MISSING_CATEGORY` | シグナルが 1 件以上あるのに `spec/<分類>/` が無い・実質空 (README のみ) |
| `UNDOCUMENTED_ITEM` | 抽出した対象名 (テーブル / エンドポイント / script / env 変数) が `spec/<分類>/` 全文に出現しない |
| `STALE_CANDIDATE` | `spec/` に記載された対象名が実装から抽出されない (陳腐化候補) |
| `FEATURE_UNCOVERED` | feature 候補に対応する `spec/feature/*.md` が無い (1 機能 1 ファイル) |

対象名の照合は正規化 (snake/camel/kebab の同一視・複数形) を掛けた上での文字列一致。
**一致しない = 欠落確定ではなく候補** — 該当性判断 (誤検知除外・命名の意訳) は
SPEC_GAP プロンプト Phase C の領分。

## 出力仕様

共通 IF に従う。`gate: false` (常に exit 0)。
`metrics: { signals: {分類: 件数}, undocumented: 件数, stale: 件数, coverage: {分類: 記載率} }`。
Anatomia は `coverage` をトレンド化し、悪化をデイリーレビューに供給する。
violations 配列はそのまま SPEC_GAP プロンプトの Phase C 入力になる形式にする
(kind / 対象名 / 根拠 `file:line`)。

## 誤検知と抑制

- `.harness-allow-spec-gaps.json` — `{ "items": ["temp_table"], "paths": ["scripts/**"] }`。
  意図的に spec 化しない対象 (実験コード・一時テーブル) を宣言する。
- フレームワーク検出は既知パターンのみ (検出できないスタックでは分類ごと
  `signals: 0` になり、無理に推測しない)。未対応スタックは metrics に
  `unsupported: true` を立て、レビュー領分へフォールバックする。

## スクリプト化しない判断系

- 候補が本当に spec を要するか (fixture / 内部ヘルパの除外) — Phase C (LLM)
- spec 本文の生成・「実装と乖離していないか」の内容比較 — Phase D (LLM)
- 機能の粒度 (何をもって 1 機能とするか) の最終判断 — レビュー領分
