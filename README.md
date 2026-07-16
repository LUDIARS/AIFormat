# AIFormat

LUDIARS 全リポジトリ共通の設計ルール・レビューフォーマットの正本。

## 入口 (作業開始時に読む)

- [`HARNESS.md`](./HARNESS.md) — **作業開始時にまず読む**。設定 / コード配置 /
  作業の進め方の 3 軸を点検し、各正本へ降りるためのハーネス(枠組み)。
  デイリーレビューに頼らず「書く前に揃える」ための入口。

## ルール (書くとき)

基盤・スタック:

- [`RULE.md`](./RULE.md) — 基盤設計ルール (認証 / DB マイグレーション / マイクロサービス / 個人データ / worktree)
- [`RULE_TECH_STACK.md`](./RULE_TECH_STACK.md) — 技術スタック選定

観点別の実装規約 (4 観点):

- [`RULE_CODE.md`](./RULE_CODE.md) — **コーディング** (第 I 部: プロジェクトごとの宣言 / 第 II 部: 全プロジェクト共通の基本ルール)
- [`RULE_DATA_SCHEMA.md`](./RULE_DATA_SCHEMA.md) — **データスキーマ** (種類分類 / 保存先 / 保護要否を spec に整備)
- [`RULE_TEST.md`](./RULE_TEST.md) — **テスト** (CI 必須 / アーキ別にコンテンツごとのテスト設計 / テスト充実度を品質基準に)
- [`RULE_SRE.md`](./RULE_SRE.md) — **SRE・運用** (種別別の運用 watchpoint / Issue 報告)

## レビュー (見るとき)

- [`REVIEW.md`](./REVIEW.md) — レビュー全体の入口
- [`prompt/`](./prompt/) — 実行プロンプト集 (フルレビュー / PR 差分レビュー / 仕様欠落検知・spec 自動生成)
- [`script_design/`](./script_design/) — 機械解析スクリプトの設計 (CI ゲート / Anatomia 計装の振り分けと検知ロジック)
- `common/REVIEW_*.md` — 共通レビューフォーマット (設計 / コード品質 / 脆弱性・サプライチェーン / 品質保証 / AI 活用 / 未実装)
- `web/` `local-app/` `game/` — スタイル別レビューフォーマット

## フォーマット

- [`FORMAT_SPEC.md`](./FORMAT_SPEC.md) — 仕様書記法 (spec/ の標準8分類、拡張可能な分類、ドキュメント充実度)
- [`FORMAT_AUTH.md`](./FORMAT_AUTH.md) — 認証記法
