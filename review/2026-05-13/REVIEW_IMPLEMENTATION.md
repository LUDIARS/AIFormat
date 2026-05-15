# 実装評価 (Implementation Evaluation)

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/AIFormat |
| 対象ブランチ / PR | main |
| レビュー実施日 | 2026-05-13 |
| 対象コミット範囲 | 016c0a7 .. f3f8ff4 |

---

## 1. コード品質 (Code Quality)

| 該当箇所 | 問題分類 | 説明 | 推奨修正 |
|----------|---------|------|---------|
| `scripts/env-leak-checker.mjs:30` | 未使用 import | `resolve` を `path` から import するが使用箇所なし | import から削除 |
| `scripts/env-leak-checker.mjs:224` | デッドコード/二重フィルタ | `args.slice(1).filter((a) => a !== "-v")` が `runCli` 内に残存。 既に `:574` で除去済 | 削除 |
| `scripts/repo-status.mjs:30-32` | 例外握りつぶし | `try/catch { return "" }` で git エラーを無音化、 デバッグ困難 | `--verbose` 時に stderr 出力 |
| `scripts/env-leak-checker.mjs:402` | マジック値 | デフォルトポート `7700` がコード内 1 箇所のみ。 README 未記載 | `const DEFAULT_PORT = 7700` 定数化 + README 記載 |
| `scripts/env-leak-checker.mjs:138` | 二重 lower 化 | `keywords.filter((kw, i) => contentLower.includes(kwLower[i]))` の後、`lineKws.filter((kw) => lineLower.includes(kw.toLowerCase()))` で再度 `toLowerCase()` 呼出し | `kwLower[i]` を再利用 |
| `scripts/utf8bom.mjs:166` | 絵文字依存 | `✓ ${rel}` で Unicode 絵文字、 Windows cmd で文字化け可 | ASCII (`[OK]`) に変更 |
| `sync.sh:55` / `sync-local.sh:64` | 重複ロジック | sed マーカー削除 + RULE embed が両ファイルで重複 | 共通関数化 or `sync-local.sh` を `sync.sh` から呼び出し |
| `scripts/utf8bom.mjs:96-113` | デリイ二重代入 | `delayMs *= 2` でループ毎に倍化、 但し関数引数のデフォルトが `delayMs = 1000` で副作用混入 | local 変数を導入 |

### チェック項目

- [x] マジックナンバー・マジックストリングが使用されていないか — 軽微 (`7700`)
- [x] 過度にネストした条件分岐がないか
- [ ] 未使用のコード・デッドコードが残存していないか — 上記 `mjs:30, :224`
- [ ] コピー&ペーストによる重複コードがないか — `sync*.sh` の重複
- [x] 変数・関数のスコープが必要以上に広くないか
- [ ] 例外の握りつぶし — `repo-status.mjs:30-32`, `ludiars-pr.mjs:34-36`, `env-leak-checker.mjs:131-133`
- [x] 不適切な型変換・暗黙的型変換がないか
- [x] ログ出力が適切なレベルで記録されているか — VERBOSE フラグで切替

---

## 2. データスキーマの妥当性・重複確認 (Data Schema Validation)

| テーブル / モデル | 問題種別 | 説明 | 推奨対応 |
|-----------------|---------|------|---------|
| `env-leak-keywords.json` | 制約不足 / スキーマ未定義 | `{keywords: string[], ignore_patterns: []}` だが Zod / JSON Schema 等の型保証なし | JSON Schema 添付 + Zod 検証 |
| `repo-status.mjs` 出力 | 型不整合 | `JSON.stringify(repos)` の構造 (`{name, branch, modified, ...}`) は inline 定義、 schema 文書なし | TypeScript or JSON Schema 定義を追加 |
| `ludiars-pr.mjs` gh JSON | API ドリフトリスク | gh CLI 出力 schema (`number,title,headRefName,updatedAt,author,reviewDecision`) に依存、 gh 更新で破綻 | gh schema 出力をテストで pin |

### チェック項目

- [x] 正規化が適切に行われているか — 該当データなし
- [x] 同一概念を表す複数のモデル定義が存在しないか
- [x] フィールドの型が格納データに対して適切か
- [ ] NOT NULL・UNIQUE・外部キー等の制約 — `env-leak-keywords.json` で重複チェックはあるが大小区別なし (`mjs:200`)
- [x] インデックスがクエリパターンに対して最適化されているか — 該当なし
- [x] マイグレーションに破壊的変更 — 該当なし
- [x] API のリクエスト/レスポンス定義とDBスキーマの間に矛盾がないか — DB なし
- [x] Enum・定数の定義がコードとスキーマで一致しているか

---

## 3. SRE観点のレビュー (SRE Review)

| 評価 | 観点 | 所見 |
|------|------|------|
| C | 可観測性 (Observability) | structured log 無し、 `console.log` 直書き。 trace-id / request-id 概念なし |
| B | デプロイ安全性 | sh コピー方式、 `<!-- BEGIN AIFormat -->` マーカー間 sed で「再実行可能」。 ロールバックは git revert 経由 |
| A | スケーラビリティ | ローカルツールなので非該当 |
| D | 障害復旧 (Disaster Recovery) | `sync.sh` 中断時の CLAUDE.md ロールバック手順なし、 sed 編集前 backup なし |
| B | 依存関係管理 | Node builtin のみ + gh / git の外部 CLI 依存。 バージョン pin なし |

### チェック項目

- [ ] 構造化ログが出力されているか — 平文 `console.log`
- [ ] メトリクス収集 (レイテンシ, エラー率, スループット) — env-leak-checker scan は per-repo ms を返すが永続化なし (`mjs:344-353`)
- [ ] ヘルスチェックエンドポイントが存在するか — env-leak-checker server に `/healthz` なし
- [x] デプロイがロールバック可能か — git revert で可
- [x] 設定変更が再デプロイなしで反映可能か — keyword は HTTP POST で動的更新可
- [ ] リソース制限 — `walkDir` に深度制限なし、 巨大シンボリックリンクで無限再帰の可能性
- [x] 水平スケーリングに対応した設計か — 該当なし (CLI)
- [ ] バックアップ・リストア手順が確立されているか — `env-leak-keywords.json` の backup なし
- [ ] SLI / SLO が定義されているか — 該当なし
- [ ] インシデント発生時のランブックが存在するか — `docs/RUNBOOK.md` 未存在

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | コード品質 | B | 0 |
| 2 | データスキーマ | A | 0 |
| 3 | SRE | C | 1 |

**評価基準:** A 問題なし / B 軽微 / C 改善要 / D 重大
