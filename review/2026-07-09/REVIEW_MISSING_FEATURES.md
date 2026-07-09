# 不足機能評価（共通） (Missing Feature Evaluation — Common)

全スタイル共通。対象リポジトリ・PR 情報を記載し、既存機能の改善案および不足機能を提案する。

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/AIFormat |
| 対象ブランチ / PR | claude/aiformat-review-audit-7bqy7r (working tree = HEAD) |
| レビュー実施日 | 2026-07-09 |
| 対象コミット範囲 | 086eb42 .. 518fdee |

---

## 1. 機能の改善提案 (Feature Improvement)

| 対象機能 | 改善提案 | 期待効果 | 優先度 |
|---------|---------|---------|--------|
| `scripts/env-leak-checker.mjs` `/api/scan` | `body.repo` を `listRepos()` の結果に含まれる名前のみ許可するホワイトリスト検証にする (VULN-001 の恒久対策) | パストラバーサル経路を閉じる | High |
| `.github/workflows/harness.yml` / `harness-checks.yml` | `permissions: { contents: read }` を明示する (VULN-003) | CI トークンの権限最小化 | Medium |
| `.github/workflows/harness-checks.yml` | `node .aiformat/scripts/env-leak-checker.mjs scan .` 等の secret/個人名混入スキャンを CI ステップに追加する (VULN-005) | 既に発生している `<local-user>` のような漏洩 (VULN-008) を機械的に検知できるようにする | Medium |
| `scripts/env-leak-checker.mjs` scan | キーワード hit 行に前後 1 行のコンテキストを含めて返す (前回提案を継続) | 偽陽性判定が容易になる | Medium |
| `scripts/repo-status.mjs` | `--remote` 指定で `git fetch --all --prune` を先行実行するモードを追加 (前回提案を継続) | ahead/behind の数値が常に最新になる | Medium |
| `scripts/utf8bom.mjs` | `--check` フラグで「BOM 未付与ファイルがあれば exit 1」を実装 (前回提案を継続) | CI での BOM 落ち検知が自動化できる | Medium |
| `scripts/ludiars-pr.mjs` | `--mine` (author:@me) / `--stale` (7日以上更新無し) フィルタを追加 (前回提案を継続) | 自分宛の review action を絞れる | Low |

---

## 2. 不足機能の提案 (Missing Feature Proposal)

| 提案機能 | 必要性の根拠 | 実装優先度 | 想定影響範囲 |
|---------|------------|-----------|------------|
| CI に lint / typecheck / test ステップを追加 | `RULE_TEST.md` §1 は全リポジトリに必須と定めるが、AIFormat 自身は `harness-check.mjs` のみで lint/test を一切実行していない (QUALITY-001) | High | `.github/workflows/harness-checks.yml` |
| `scripts/*.mjs` のテストスイート (`node:test` 等) | 14 本の CLI/CI ゲートスクリプトにテストが 1 件も無い (QUALITY-001, AI-002) | High | `scripts/` 全体 |
| `package.json` (テスト/lint 実行の起点) | Node 22 想定の共通スクリプト (`npm test` 等) を定義する土台が無い (前回提案を継続、依然未実装) | High | リポジトリルート |
| `.gitignore` | `git ls-files` で確認した範囲に `.gitignore` が存在しない。個人 keyword JSON の派生ファイル等を除外する仕組みが無い (前回提案を継続、依然未実装) | Medium | 全体 |
| `sync.sh` の Windows ネイティブ版 (PowerShell) | `RULE_TECH_STACK.md:137` の Windows/Linux 両対応方針、および `.claude/skills/npm-scripts-crossplatform.md` の存在と矛盾したまま (DESIGN-001, 前回提案を継続、依然未実装) | High | sync 周辺 |
| `sync.sh` / `sync-local.sh` の embed 対象拡張 (`RULE*.md` → `RULE*.md` + `FORMAT*.md`) | `sync.sh:64` / `sync-local.sh:75` は依然 `RULE*.md` のみを embed し、`FORMAT_AUTH.md` / `FORMAT_SPEC.md` は同期されない (前回提案を継続、依然未実装) | High | `sync.sh`, `sync-local.sh` |
| `env-leak-checker` の CSRF/認証対策 (token-gate または Origin 検証) | `serve` モードの HTTP API に Origin/CSRF 検証が無く、具体的な到達経路が確認された (VULN-001。前回は「保険が無い」という一般的指摘だったが、今回は再現可能な経路として特定) | Medium | `scripts/env-leak-checker.mjs` |
| `spec/` の自己適用 (`scaffold-spec.mjs` を AIFormat 自身に実行) | AIFormat が定義した `FORMAT_SPEC.md` の 7 分類構造を、AIFormat 自身が持っていない (QUALITY-002) | Medium | リポジトリルート |
| `CONTRIBUTING.md` | 配布リポジトリだが編集ワークフロー (PR 規約等) が文書化されていない (前回提案を継続、依然未実装) | Low | docs |
| keyword 設定の Schema 定義 (`env-leak-keywords.schema.json`) | `{keywords: string[], ignore_patterns: []}` の構造が暗黙的で型保証が無い (前回提案を継続、依然未実装) | Low | `scripts/` |
| `review/` 出力テンプレ生成スクリプト (`scripts/new-review.mjs`) | 日付ディレクトリ作成・テンプレコピーが手動 (前回提案を継続、依然未実装) | Low | `scripts/` |

---

## 総合評価

| # | レビュー観点 | 指摘数 | 優先度別内訳 |
|---|------------|--------|------------|
| 1 | 機能改善 | 7 | High: 1 / Medium: 5 / Low: 1 |
| 2 | 不足機能 | 10 | High: 4 / Medium: 3 / Low: 3 |

**優先度基準:**
- **High**: 不具合・セキュリティ・データ保全・法令対応に直結する
- **Medium**: 品質・運用効率・開発速度を明確に改善する
- **Low**: 利便性・体験の向上に留まる

> 本ドキュメントの 2 観点は A〜D の評価軸を持たない（提案であり現状の欠陥指摘ではないため）。
> 総合評価表では評価を「-」とし、指摘数と優先度内訳のみ記載する。
