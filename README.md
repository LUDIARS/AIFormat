# AIFormat

LUDIARS 全リポジトリ共通の設計ルール・レビューフォーマットの正本。

## ルール (書くとき)

- [`RULE.md`](./RULE.md) — 基盤設計ルール (認証 / DB マイグレーション / マイクロサービス / 個人データ / worktree)
- [`RULE_CODE.md`](./RULE_CODE.md) — コード規約 (単一責任 / ファイル分割 / レイヤー依存 / 命名 / 例外処理)
- [`RULE_TECH_STACK.md`](./RULE_TECH_STACK.md) — 技術スタック選定

## レビュー (見るとき)

- [`REVIEW.md`](./REVIEW.md) — レビュー全体の入口
- `common/REVIEW_*.md` — 共通レビューフォーマット (設計 / コード品質 / 品質保証 / 脆弱性 / 未実装)
- `web/` `local-app/` `game/` — スタイル別レビューフォーマット

## フォーマット

- [`FORMAT_SPEC.md`](./FORMAT_SPEC.md) — 仕様書記法
- [`FORMAT_AUTH.md`](./FORMAT_AUTH.md) — 認証記法
