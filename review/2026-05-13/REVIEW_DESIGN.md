# 設計レビュー (Design Review)

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/AIFormat |
| 対象ブランチ / PR | main |
| レビュー実施日 | 2026-05-13 |
| 対象コミット範囲 | 016c0a7 .. f3f8ff4 |

---

## 1. 設計強度 (Design Robustness)

| 評価 | 観点 | 所見 |
|------|------|------|
| B | 障害分離 | スクリプトは各 mjs 独立。ネットワーク I/O は env-leak-checker のみ。`scripts/utf8bom.mjs:98-113` で EBUSY 指数リトライあり |
| B | 冪等性 | `sync.sh:54-56` で `<!-- BEGIN AIFormat -->` マーカー間 sed 削除→再 append により冪等。skill コピーは `aiformat-` prefix で衝突回避 (`sync.sh:45`) |
| B | 入力バリデーション | CLI 引数は最低限。`utf8bom.mjs:51-55` で dir 未指定なら exit、`env-leak-checker.mjs:196-200` で `add` 空 keyword reject |
| C | エラーハンドリング | `repo-status.mjs:30-33` で git エラーを `catch { return "" }` で握りつぶし、原因が隠れる。stderr 出力なし |
| C | リトライ・タイムアウト設計 | utf8bom のみ EBUSY リトライ。`env-leak-checker` の HTTP server / readFile に timeout なし、巨大バイナリで詰まる可能性 |
| B | 状態管理の明確性 | JSON 設定 (`env-leak-keywords.json`) を都度 load/save。プロセス内キャッシュ無しで状態は単純 |

### チェック項目

- [x] 単一障害点 (SPOF) が存在しないか — スクリプト群はスタンドアロン
- [ ] 外部サービス障害時の縮退動作が定義されているか — `ludiars-pr.mjs:28-38` は gh 失敗時 null で skip するのみ、リトライなし
- [x] 入力値の境界値・異常値に対する防御が十分か — CLI 範囲では妥当
- [ ] エラー発生時にシステムが安全な状態に遷移するか (fail-safe) — `sync.sh` の sed が失敗した場合 CLAUDE.md が壊れる可能性 (バックアップ無し)
- [ ] 非同期処理のタイムアウトとキャンセル機構があるか — `env-leak-checker.mjs:280-371` の HTTP server に timeout / abort なし
- [x] 競合状態 (race condition) のリスクが排除されているか — シングルプロセス CLI 主体

---

## 2. 設計思想の一貫性 (Design Philosophy Compliance)

| 該当箇所 | 逸脱内容 | 本来の設計思想 | 推奨修正 |
|----------|---------|--------------|---------|
| `sync.sh:1` / `sync-local.sh:1` | bash 専用シェルスクリプト | LUDIARS 規約は Windows メイン + Node.js 22 統一 (`RULE_TECH_STACK.md:24`)。bash + sed -i は git-bash でしか動かない | `.mjs` 化 or `cross-spawn` で Windows 互換に統一 |
| `scripts/env-leak-checker.mjs:32` | `BASE_DIR` 既定が `<workspace-root>` (個人 PC 絶対パス) | 規約上は環境変数 / 設定ファイルに外出し (`REVIEW_DESIGN.md` チェック項目) | `LUDIARS_BASE` 必須化 or repo 相対パスに変更 |
| `scripts/env-leak-keywords.json:3` | 個人名 `<local-user>` が default keyword に commit 済 | 個人データ非保管 (`MEMORY.md` 個人データ保管禁止) | gitignore + `*.example.json` で配布 |
| `scripts/utf8bom.mjs:23-31` | 拡張子の集合がハードコード | RULE.md は「設定値の外出し」を要求 | `--ext-config` で JSON 受けて上書き可能に |
| `README.md:1` | 単行 `# AIFormat` のみ | RULE 系プロジェクトは概要・最短起動手順を README に記載すべき | 配布対象 / sync 手順 / scripts 一覧を追記 |

### チェック項目

- [x] レイヤー間の依存方向が規約通りか — 一方向 (AIFormat → 他リポ)
- [ ] 命名規則がプロジェクト全体で統一されているか — `REVIEW.md` / `RULE.md` / `FORMAT_*.md` の三系統が混在、`sync.sh` は `RULE*.md` のみ embed で `FORMAT_*.md` は無視 (`sync.sh:64`)
- [ ] 共通パターン (リポジトリパターン, サービス層等) が一貫して適用されているか — sh と mjs が混在、`ludiars-pr` は過去 .bat→.mjs 統合済 (`64bb55b`) も sync.sh は残存
- [x] 既存のユーティリティ・ヘルパーを無視した再実装がないか
- [x] 責務の配置がアーキテクチャの意図と合致しているか
- [ ] 設定値のハードコーディングがないか — `<workspace-root>` 絶対パスが複数箇所 (`env-leak-checker.mjs:32`, `repo-status.mjs:16`, `ludiars-pr.mjs:13`)

---

## 3. モジュール分割度 / 機能的凝集度 (Cohesion & Modularity)

| モジュール / クラス | 凝集度評価 | 所見 |
|-------------------|-----------|------|
| `scripts/env-leak-checker.mjs` | 論理的 / 通信的 | CLI + GUI HTTP server + HTML SPA が同一ファイル (588 行)。 描画 (HTML 文字列) と scan ロジックが密結合 |
| `scripts/repo-status.mjs` | 機能的 | git status 集約のみ。 ANSI 出力 / JSON 出力分岐は妥当 |
| `scripts/utf8bom.mjs` | 機能的 | UTF-8 BOM 変換単機能。 retry 含めて凝集度高 |
| `scripts/ludiars-pr.mjs` | 機能的 | gh PR 集計のみ |
| `sync.sh` / `sync-local.sh` | 通信的 / 偶発的 | skill コピー + CLAUDE.md 編集 が同一 sh。 2 ファイルでロジック重複 (`sync.sh:54-72` と `sync-local.sh:62-83`) |
| `REVIEW_*.md` / `RULE_*.md` テンプレ | 機能的 | テンプレ責務は明確に分割 |

### チェック項目

- [ ] 1つのクラス・モジュールが複数の無関係な責務を持っていないか — `env-leak-checker.mjs` が CLI/HTTP/HTML を兼ねる
- [x] God Object / God Class が存在しないか
- [x] 結合度が不必要に高くないか
- [x] 循環依存が発生していないか
- [x] インターフェースが適切に分離されているか
- [ ] パッケージ・ディレクトリ構成がドメインの構造を反映しているか — `scripts/` 直下にフラット配置、grouping (`scripts/leak/`, `scripts/sync/`) なし

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | 設計強度 | B | 0 |
| 2 | 設計思想の一貫性 | B | 0 |
| 3 | モジュール分割度 | B | 0 |

**評価基準:** A 問題なし / B 軽微 / C 改善要 / D 重大
