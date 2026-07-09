# CODE_HYGIENE — コード衛生シグナル集計 (code-hygiene.mjs)

| 項目 | 値 |
|------|-----|
| 区分 | **Anatomia 計装** (report-only・トレンド化) |
| 対応レビュー観点 | [`common/REVIEW_CODE_QUALITY.md`](../common/REVIEW_CODE_QUALITY.md) のうち RULE_CODE §7 / §15 / §19 / §20 由来の機械列挙可能項目 |
| 状態 | 設計 (実装は Anatomia 側) |

## 目的

コード品質レビューのチェック項目のうち、**列挙は機械・是非の判断は文脈**という
シグナル群を毎日集計し、件数のトレンドを Anatomia に蓄積する。デイリーレビューは
生の grep をやり直す代わりに、この集計と差分 (増えた箇所) から確認を始める。

## 検知ロジック (すべて report-only)

| kind | 判定 | 対応規約 |
|------|------|---------|
| `EMPTY_CATCH` | `catch` ブロックが空、または理由コメント無しで握りつぶしている | RULE_CODE §7 |
| `CONSOLE_DIRECT` | 共有ロガー (Vestigium) 依存があるのに `console.log/warn/error` 直書きが本番コードに残る | RULE_CODE §15 |
| `TODO_NO_ISSUE` | `TODO` / `FIXME` に Issue 参照 (`#123` / URL) が無い | RULE_CODE §20 |
| `COMMENTED_CODE` | 連続 3 行以上のコメントアウトされたコード様行 | RULE_CODE §20 |
| `NONNULL_ASSERT` | non-null 断言 (`!.` / `!` 後置) の件数 (TS) | RULE_CODE §19 |
| `PATH_HARDCODE` | 絶対パス・個人フォルダ・`http://localhost` 等の直書き (設定ファイル・テスト除く) | RULE_CODE §6 |

除外既定: テストコード・`node_modules`・生成物・`scripts/` 直下の CLI 出力用 console。

## 出力仕様

共通 IF に従う。`gate: false`。`metrics` に kind 別件数、violations に上位 N 件
(新規出現分を優先) を載せる。Anatomia 側は前回スナップショットとの差分
(`new` / `resolved`) を計算してデイリーレビューへ供給する。

## 誤検知と抑制

- `.harness-allow-hygiene.json` — kind × path glob で抑制。CLI ツールの console 出力等、
  「正当な直書き」はここで宣言し、レビュー成果物から参照可能にする。
- **CI ゲートにしない**。どの kind も正当な例外がありうる (だからこそ計装)。
  件数ゼロ強制ではなく「増加の検知」を目的とする。

## スクリプト化しない判断系

- 該当箇所が本当に問題か (best-effort swallow の妥当性・console の正当性) — レビュー領分
- マジックナンバー・命名・関数長 — 該当性判断が本体のため対象外
- lint / 型で機械化済みの項目 (floating promise / unused import) — 各リポの linter に委譲
  (linter が CI にあるかは [`CI_SECURITY.md`](./CI_SECURITY.md) ではなくレビューが確認)
