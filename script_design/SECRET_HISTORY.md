# SECRET_HISTORY — シークレット混入スキャン (check-secret-history.mjs)

| 項目 | 値 |
|------|-----|
| 区分 | **2 段構え**: 高確度パターン = CI ゲート / 低確度パターン = Anatomia 計装 |
| 対応レビュー観点 | [`common/REVIEW_VULNERABILITY.md`](../common/REVIEW_VULNERABILITY.md) §1 ハードコードシークレット / §2 secret 混入スキャン (git 履歴含む) |
| 関連既存 | [`scripts/env-leak-checker.mjs`](../scripts/env-leak-checker.mjs) (キーワード方式・作業ツリーのみ) |
| 状態 | 設計 (実装は Anatomia 側) |

## 目的

作業ツリーと **git 履歴**の両方からシークレット混入を検知する。env-leak-checker の
キーワード方式 (登録した環境名・個人名) に、**構造パターン方式** (キーの形そのもの) を足す。

## 検知ロジック

### Tier 1 — 高確度 (CI ゲート。誤検知ほぼゼロのパターンのみ)

| kind | 判定 |
|------|------|
| `PRIVATE_KEY` | `-----BEGIN (RSA\|EC\|OPENSSH\|PGP) PRIVATE KEY-----` ブロック |
| `KNOWN_TOKEN_FORMAT` | ベンダー固定形式: `ghp_` / `github_pat_` / `sk-ant-` / `AKIA[0-9A-Z]{16}` / `xox[bp]-` 等 (プレフィクス + 長さ + 文字種まで一致) |
| `DOTENV_COMMITTED` | `.env` (`.env.example` 以外) がトラッキングされている |

### Tier 2 — 低確度シグナル (Anatomia 計装。report-only)

| kind | 判定 |
|------|------|
| `HIGH_ENTROPY_ASSIGN` | `password / secret / token / api[_-]?key` への代入右辺が高エントロピー文字列 |
| `HISTORY_HIT` | git 履歴 (全 blob) に対する Tier 1/2 パターンのヒット (現 HEAD に無くても検知) |
| `KEYWORD_HIT` | env-leak-keywords.json のキーワード (既存機能の取り込み) |

履歴走査は `git rev-list --objects` + blob 走査で行い、日次 (Anatomia) で全量、
PR 時は差分 blob のみの増分実行とする。

## 出力仕様

共通 IF に従う。Tier 1 は `gate: true`、Tier 2 は `gate: false` +
`metrics: { history_hits, tree_hits }`。履歴ヒットは `path` に `<commit>:<file>` を入れる。

## 誤検知と抑制

- `.harness-allow-secrets.json` — `{ "paths": ["test/fixtures/**"], "kinds": [...] }`。
  テスト用のダミー鍵は fixture パス指定で抑制 (抑制内容自体がレビューで見える)。
- Tier 2 を CI ゲートに昇格させない。エントロピー判定は原理的に誤検知が残る。

## スクリプト化しない判断系

- ヒットが「本物の有効なシークレットか」の確認・失効対応 — インシデント対応 (人間)。
- ログ・例外メッセージへの秘密情報出力 (実行時の挙動) — レビュー領分 (RULE_CODE §14)。
