# AI Code Review Format — Web サービス

Web サービス（サーバ / API / Web フロントエンド）向けのレビューフォーマット。
[共通レビュー項目](../common/) に加え、Web 固有の観点を適用する。

| 項目 | 値 |
|------|-----|
| リポジトリ | |
| 対象ブランチ / PR | |
| レビュー実施日 | |
| 対象コミット範囲 | |

---

## レビュードキュメント一覧

### 共通（[common/](../common/)）

| ドキュメント | 含まれるレビュー観点 |
|------------|-------------------|
| [設計レビュー](../common/REVIEW_DESIGN.md) | 設計強度 / 設計思想の一貫性 / モジュール分割度 |
| [コード品質レビュー](../common/REVIEW_CODE_QUALITY.md) | コード品質 |
| [脆弱性レビュー（共通）](../common/REVIEW_VULNERABILITY.md) | コードレベル脆弱性 |
| [品質保証レビュー](../common/REVIEW_QUALITY.md) | テスト戦略 / ライセンス遵守 / ドキュメント完備性 |
| [不足機能評価](../common/REVIEW_MISSING_FEATURES.md) | 機能改善 / 不足機能 |

### Web 固有

| ドキュメント | 含まれるレビュー観点 |
|------------|-------------------|
| [Web 脆弱性レビュー](REVIEW_VULNERABILITY_WEB.md) | Web 脆弱性 / ゼロトラスト / セキュリティ強度 |
| [Web 実装評価](REVIEW_IMPLEMENTATION_WEB.md) | データスキーマ / SRE |
| [Web 品質保証レビュー](REVIEW_QUALITY_WEB.md) | パフォーマンス / クロスプラットフォーム |

---

## 総合評価 (Overall Assessment)

| # | レビュー観点 | 区分 | 評価 | 重大指摘数 | ドキュメント |
|---|------------|------|------|-----------|------------|
| 1 | 設計強度 | 共通 | A~D | | [設計レビュー](../common/REVIEW_DESIGN.md) |
| 2 | 設計思想の一貫性 | 共通 | A~D | | [設計レビュー](../common/REVIEW_DESIGN.md) |
| 3 | モジュール分割度 | 共通 | A~D | | [設計レビュー](../common/REVIEW_DESIGN.md) |
| 4 | コード品質 | 共通 | A~D | | [コード品質レビュー](../common/REVIEW_CODE_QUALITY.md) |
| 5 | コードレベル脆弱性 | 共通 | A~D | | [脆弱性レビュー（共通）](../common/REVIEW_VULNERABILITY.md) |
| 6 | テスト戦略・カバレッジ | 共通 | A~D | | [品質保証レビュー](../common/REVIEW_QUALITY.md) |
| 7 | ライセンス遵守 | 共通 | A~D | | [品質保証レビュー](../common/REVIEW_QUALITY.md) |
| 8 | ドキュメント完備性 | 共通 | A~D | | [品質保証レビュー](../common/REVIEW_QUALITY.md) |
| 9 | 機能改善 | 共通 | - | | [不足機能評価](../common/REVIEW_MISSING_FEATURES.md) |
| 10 | 不足機能 | 共通 | - | | [不足機能評価](../common/REVIEW_MISSING_FEATURES.md) |
| 11 | Web 脆弱性 | Web | A~D | | [Web 脆弱性レビュー](REVIEW_VULNERABILITY_WEB.md) |
| 12 | ゼロトラスト | Web | A~D | | [Web 脆弱性レビュー](REVIEW_VULNERABILITY_WEB.md) |
| 13 | セキュリティ強度 | Web | A~D | | [Web 脆弱性レビュー](REVIEW_VULNERABILITY_WEB.md) |
| 14 | データスキーマ | Web | A~D | | [Web 実装評価](REVIEW_IMPLEMENTATION_WEB.md) |
| 15 | SRE | Web | A~D | | [Web 実装評価](REVIEW_IMPLEMENTATION_WEB.md) |
| 16 | パフォーマンス・ベンチマーク | Web | A~D | | [Web 品質保証レビュー](REVIEW_QUALITY_WEB.md) |
| 17 | クロスプラットフォーム互換 | Web | A~D | | [Web 品質保証レビュー](REVIEW_QUALITY_WEB.md) |

**評価基準**（重大度の定義・導出ルール・対象外の扱いは [REVIEW.md「評価の決定ルール」](../REVIEW.md#評価の決定ルール) を正本とする）:
- **A**: 指摘 0 件。チェック項目をすべて満たす
- **B**: Medium / Low の指摘のみ。運用上の影響は低い
- **C**: High の指摘が 1 件以上。リリース前の対応を推奨
- **D**: Critical の指摘が 1 件以上。即時対応が必要
