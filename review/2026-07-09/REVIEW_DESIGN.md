# 設計レビュー（共通） (Design Review — Common)

全スタイル共通。対象リポジトリ・PR 情報を記載し、設計の堅牢性・一貫性・モジュール構造を評価する。

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/AIFormat |
| 対象ブランチ / PR | claude/aiformat-review-audit-7bqy7r (working tree = HEAD)。origin/main 最新 (810b456) とは `scripts/scores-keys.json` 等に差分あり — 詳細は [REVIEW.md](REVIEW.md) 総合サマリの「レビュー範囲の注記」参照 |
| レビュー実施日 | 2026-07-09 |
| 対象コミット範囲 | 086eb42 (このブランチの最古コミット) .. 518fdee (HEAD) |

---

## 1. 設計強度 (Design Robustness)

アーキテクチャおよび設計の堅牢性を評価する。

| 評価 | 観点 | 所見 |
|------|------|------|
| B | 障害分離 | 各 `scripts/*.mjs` は独立したスタンドアロン CLI で、1 ツールの障害が他ツールに波及しない (`git ls-files` で package.json 無し = 依存共有も無いことを確認)。`env-leak-checker.mjs` は同一プロセスで CLI/HTTP API/HTML 配信を兼ねるが (DESIGN-006 参照)、単一障害点というほどの致命性は無い |
| A | 冪等性 | `sync.sh:54-56` / `sync-local.sh:62-67` は `<!-- BEGIN AIFormat -->`〜`<!-- END AIFormat -->` マーカー間を sed で削除してから再追記するため再実行しても結果が収束する。`scaffold-spec.mjs:84-88` の `writeIfAbsent` も既存ファイルを上書きしない設計で確認済み |
| B | 入力バリデーション | CLI 引数は概ね検証されている (`utf8bom.mjs:52-55` dir 未指定で exit、`env-leak-checker.mjs:196-199` add の空 keyword reject)。一方 HTTP API 側は `POST /api/keywords` の `body.keyword` に型検証が無く (VULN-002)、`POST /api/scan` の `body.repo` も未検証で `join(BASE_DIR, body.repo)` に渡る (VULN-001) |
| B | エラーハンドリング | `repo-status.mjs:23-33` / `ludiars-pr.mjs:15-26` の `catch {}` は理由コメント無しで例外を握りつぶす (CODEQ-003, RULE_CODE §7 は握りつぶす場合の理由コメント明示を求める) |
| B | リトライ・タイムアウト設計 | `utf8bom.mjs:98-113` は EBUSY に対する指数バックオフ再試行を実装済み。一方 `env-leak-checker.mjs:279-369` の HTTP server にはリクエストタイムアウト/キャンセル機構が無い (DESIGN-004) |
| A | 状態管理の明確性 | 永続状態は `env-leak-keywords.json` 1 ファイルのみで、都度 load/save するステートレス設計。プロセス内キャッシュが無く状態遷移は単純 |

### チェック項目

- [x] 単一障害点 (SPOF) が存在しないか — スクリプト群はスタンドアロン (DESIGN-006 の凝集度指摘はあるが SPOF ではない)
- [x] 外部サービス・外部リソース障害時の縮退動作が定義されているか — `ludiars-pr.mjs:61-64` は `gh` 失敗時に該当リポをログ出力してスキップする縮退動作あり
- [ ] 入力値の境界値・異常値に対する防御が十分か — HTTP API の `body.keyword` / `body.repo` に型・範囲検証が無い (VULN-001, VULN-002)
- [ ] エラー発生時にシステムが安全な状態に遷移するか (fail-safe) — `sync.sh` / `sync-local.sh` は `CLAUDE.md` を sed で直接書き換えるがバックアップを取らない (DESIGN-005)
- [ ] 非同期処理のタイムアウトとキャンセル機構があるか — `env-leak-checker.mjs` の HTTP server に `setTimeout` 等の設定が無い (DESIGN-004)
- [x] 競合状態 (race condition) のリスクが排除されているか — CLI 単体は概ねシングルプロセス逐次実行。HTTP API 経由の keyword ファイル同時書き込みレースは VULN-006 (脆弱性レビュー) で扱う

---

## 2. 設計思想の一貫性 (Design Philosophy Compliance)

プロジェクトの設計思想・規約から逸脱しているコードを検出する。

| 該当箇所 | 逸脱内容 | 本来の設計思想 | 推奨修正 |
|----------|---------|--------------|---------|
| `sync.sh:1` / `sync-local.sh:1` | `#!/bin/bash` の bash 専用シェルスクリプト。GNU 拡張の `sed -i` を使用 | `RULE_TECH_STACK.md:137` は npm scripts に Windows (cmd.exe) / Linux・macOS 両対応の記法を要求し、本リポジトリ自身が `.claude/skills/npm-scripts-crossplatform.md` を配布している | `.mjs` 化するか `sync.ps1` を追加し、git-bash 必須の状態を解消する (DESIGN-001) |
| `scripts/env-leak-checker.mjs:32`, `scripts/infisical-setup.mjs:30`, `scripts/repo-status.mjs:16`, `scripts/ludiars-pr.mjs:13` | `BASE_DIR` の既定値が個人環境の絶対パス `"<workspace-root>"` のハードコード。`LUDIARS_BASE` 未設定時はこの値へ無言でフォールバックする | `RULE_CODE.md` §6「環境依存値をソースに直書きしない・個人フォルダパスの禁止」および §7.1「設定不備による無言フォールバックは禁止・エラーにする」に反する | `LUDIARS_BASE` (または `ludiars-pr.mjs` は `argv[2]`) が未設定なら既定値へ逃げず `process.exit(1)` 相当で明示的にエラー終了する |

### チェック項目

- [x] レイヤー間の依存方向が規約通りか — 一方向 (AIFormat → 各リポへ配布)。循環依存無し
- [ ] 命名規則がプロジェクト全体で統一されているか — `REVIEW.md` 系 / `RULE.md` 系 / `FORMAT_*.md` 系の 3 系統が混在すること自体は `README.md` で整理済みだが、`FORMAT_SPEC.md` の分類数表記が「7 分類」と「6 分類」で 6 箇所ドリフトしている (QUALITY-004, ドキュメント完備性側で計上)
- [ ] 共通パターン (リポジトリパターン, サービス層等) が一貫して適用されているか — `sync.sh` と `sync-local.sh` がスキルコピー + `CLAUDE.md` 編集ロジックをほぼそのまま重複実装 (DESIGN-002 参照、§3 で計上)
- [x] 既存のユーティリティ・ヘルパーを無視した再実装がないか — 確認範囲内で重複実装は見つからず (`check-*.mjs` 系は共通の `safeReaddir`/`isDir` パターンを各ファイルで独立実装しているが、依存を持たない設計方針 (package.json 無し) の帰結であり無視した再実装とは判断しない)
- [x] 責務の配置がアーキテクチャの意図と合致しているか — `common/` (共通レビュー) と `web/`/`local-app/`/`game/` (スタイル別) の分離は `REVIEW.md` の記述と一致
- [ ] 設定値のハードコーディングがないか — `<workspace-root>` 絶対パスが 4 スクリプトに直書き (DESIGN-003, 上表)

---

## 3. モジュール分割度 / 機能的凝集度 (Cohesion & Modularity)

各モジュールが単一の責務に集中しているかを評価する。

| モジュール / クラス | 凝集度評価 | 所見 |
|-------------------|-----------|------|
| `scripts/env-leak-checker.mjs` | 論理的 / 通信的 | CLI 引数処理・keyword 永続化・ファイル走査エンジン・HTTP API・HTML(埋め込み SPA, `:392-564`) の 5 責務が 1 ファイル (588 行) に同居 (DESIGN-006) |
| `scripts/repo-status.mjs` | 機能的 | git status 集約のみに専念。ANSI / JSON 出力の分岐は単一責務内の表現差として妥当 |
| `scripts/utf8bom.mjs` | 機能的 | UTF-8 BOM 変換に専念。リトライロジックも同一責務内 |
| `scripts/ludiars-pr.mjs` | 機能的 | `gh` PR 集計のみ |
| `scripts/check-*.mjs` (4 本) | 機能的 | 1 スクリプト 1 チェックルールで明確に分離。`harness-check.mjs` が umbrella として `spawnSync` で束ねる設計は良好 |
| `sync.sh` / `sync-local.sh` | 通信的 / 偶発的 | スキル・コマンドコピー + `CLAUDE.md` 編集ロジックがほぼ丸ごと重複 (DESIGN-002) |
| `common/` `web/` `local-app/` `game/` `REVIEW_*.md` テンプレ | 機能的 | 観点ごとに文書が分離されており、`scripts/scores-keys.json` の観点列とも一致 (整合検査済み、後述) |

### チェック項目

- [ ] 1つのクラス・モジュールが複数の無関係な責務を持っていないか — `env-leak-checker.mjs` が CLI/永続化/走査/HTTP/HTML の複数責務を持つ (DESIGN-006)
- [x] God Object / God Class が存在しないか — 上記は「同居」であり単一の巨大クラスではない。決定的な God Class は見つからず
- [x] 結合度が不必要に高くないか — 各 `scripts/*.mjs` は import 依存を持たず (`node:*` のみ)、相互結合は無い
- [x] 循環依存が発生していないか — 確認範囲内で循環依存無し
- [x] インターフェースが適切に分離されているか — CLI 引数 IF と HTTP API IF は明確に分かれている
- [ ] パッケージ・ディレクトリ構成がドメインの構造を反映しているか — `scripts/` 直下にフラット配置 (14 ファイル)。CI ゲート系 (`check-*.mjs`) とユーティリティ系 (`env-leak-checker.mjs` 等) のサブディレクトリ分割は無い (前回から継続、Low 相当の所見に留め独立の指摘 ID は起票しない — 実害が乏しく DESIGN-006 の範囲内で捕捉済み)

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | 設計強度 | B | 0 |
| 2 | 設計思想の一貫性 | B | 0 |
| 3 | モジュール分割度 | B | 0 |

**評価基準**（重大度の定義・導出ルール・対象外の扱いは [REVIEW.md「評価の決定ルール」](../../REVIEW.md#評価の決定ルール) を正本とする）:
- **A**: 指摘 0 件。チェック項目をすべて満たす
- **B**: Medium / Low の指摘のみ。運用上の影響は低い
- **C**: High の指摘が 1 件以上。リリース前の対応を推奨
- **D**: Critical の指摘が 1 件以上。即時対応が必要

## 指摘一覧 (このドキュメント分)

| ID | 該当節 | 重大度 | 該当箇所 | 概要 |
|----|--------|--------|----------|------|
| DESIGN-001 | §2 | Medium | `sync.sh:1`, `sync-local.sh:1` | bash 専用で Windows ネイティブ非対応 |
| DESIGN-002 | §3 | Low | `sync.sh:37-76`, `sync-local.sh:29-86` | スキルコピー + CLAUDE.md 編集ロジックの重複 |
| DESIGN-003 | §2 | Medium | `env-leak-checker.mjs:32` 他 3 箇所 | 個人環境パスのハードコードフォールバック |
| DESIGN-004 | §1 | Low | `env-leak-checker.mjs:279-369` | HTTP server にタイムアウト機構が無い |
| DESIGN-005 | §1 | Medium | `sync.sh:54-56`, `sync-local.sh:62-67` | CLAUDE.md 書き換え前にバックアップを取らない |
| DESIGN-006 | §3 | Low | `env-leak-checker.mjs` 全体 | CLI/HTTP API/HTML の 3 責務が 1 ファイルに同居 |
