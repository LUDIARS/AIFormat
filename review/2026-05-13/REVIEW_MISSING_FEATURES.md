# 不足機能評価 (Missing Feature Evaluation)

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/AIFormat |
| 対象ブランチ / PR | main |
| レビュー実施日 | 2026-05-13 |
| 対象コミット範囲 | 016c0a7 .. f3f8ff4 |

---

## 1. 機能の改善提案 (Feature Improvement)

| 対象機能 | 改善提案 | 期待効果 | 優先度 |
|---------|---------|---------|--------|
| `scripts/env-leak-checker.mjs` scan | キーワード hit 行に before/after コンテキスト 1 行を含めて返す (`mjs:148-153`) | 偽陽性判定が容易、 GUI 表示が読みやすい | Medium |
| `scripts/repo-status.mjs` | `--remote` 指定で `git fetch --all --prune` を先行実行するモード追加 | ahead/behind 数値が常に最新、 朝の状況把握が正確に | Medium |
| `sync.sh` / `sync-local.sh` | embed 対象を `RULE*.md` から `RULE*.md + FORMAT*.md` に拡張 (`sync.sh:64` は RULE のみ) | FORMAT_AUTH.md / FORMAT_SPEC.md が各リポに同期される | High |
| `scripts/utf8bom.mjs` | `--check` フラグで「BOM 未付与ファイルがあれば exit 1」を実装、 CI で活用 | pre-commit / CI で BOM 落ち検知が自動化 | Medium |
| `scripts/ludiars-pr.mjs` | `--mine` で `author:@me` フィルタ、 `--stale` で 7 日以上更新無しを抽出 | 自分宛の review action を絞れる | Low |

### 観点

- パフォーマンス最適化 (N+1クエリ, 不要な計算, キャッシュ活用)
- ユーザ体験の向上 (レスポンス速度, エラーメッセージの改善)
- テスタビリティの向上 (依存注入, モック可能性)
- 運用負荷の軽減 (自動化, 設定の簡素化)

---

## 2. 不足機能の提案 (Missing Feature Proposal)

| 提案機能 | 必要性の根拠 | 実装優先度 | 想定影響範囲 |
|---------|------------|-----------|------------|
| CI ワークフロー (`.github/workflows/lint.yml`) | 全 mjs に lint / format / typecheck の自動実行が無い (`git ls-files` で `.github/` 不在を確認) | High | リポジトリ全体 |
| テストスイート (vitest / node:test) | `scripts/*.mjs` 4 本全てに unit/integration テストが皆無 | High | scripts/ 全体 |
| `package.json` + lock | Node 22 / 共通スクリプト (npm run leak, npm run status) を定義する起点が無い | High | リポジトリルート |
| `.gitignore` | review/ 配下や WIP ファイルの除外、 個人 keyword JSON の `.local` 派生を git 管理外にする | Medium | 全体 |
| `CONTRIBUTING.md` / `RUNBOOK.md` | 配布リポなのに編集ワークフロー (PR 規約, sync.sh 実行タイミング) が文書化されていない | Medium | docs |
| `sync.sh` の Windows 版 (PowerShell) | 規約上は Windows 主環境 (`RULE_TECH_STACK.md` Node 22 + Windows)。 sh 専用は git-bash 必須 | High | sync 周辺 |
| `env-leak-checker` の認証 (token-gate) | localhost 想定でも、`0.0.0.0` バインド + CORS `*` で LAN 露出時の保険が無い | Medium | scripts/env-leak-checker.mjs |
| Schema 定義 (`schema/env-leak-keywords.schema.json`) | 設定ファイルの構造が暗黙、 zod / JSON Schema での型保証なし | Low | scripts/ |
| `review/` 出力テンプレ生成スクリプト (`scripts/new-review.mjs`) | 各リポで `review/YYYY-MM-DD/` を作る作業が手動、 テンプレ自動コピーがあると展開が楽 | Medium | scripts/ |

### 観点

- 入力バリデーションの不足
- エラー通知・アラートの欠如
- 監査ログの不足
- ヘルスチェック・死活監視の未実装
- レート制限の未実装
- バッチ処理・リトライ機構の不足
- ドキュメント・API仕様の不足

---

## 総合評価

| # | レビュー観点 | 指摘数 | 優先度別内訳 |
|---|------------|--------|------------|
| 1 | 機能改善 | 5 | High: 1 / Medium: 3 / Low: 1 |
| 2 | 不足機能 | 9 | High: 4 / Medium: 4 / Low: 1 |
