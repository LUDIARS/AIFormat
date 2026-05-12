# AI Code Review Format

対象リポジトリ・PR情報を記載し、以下の各観点でレビューを実施する。

| 項目 | 値 |
|------|-----|
| リポジトリ | |
| 対象ブランチ / PR | |
| レビュー実施日 | |
| 対象コミット範囲 | |

---

## レビュードキュメント一覧

| ドキュメント | 内容 | 含まれるレビュー観点 |
|------------|------|-------------------|
| [設計レビュー](REVIEW_DESIGN.md) | アーキテクチャ・設計の堅牢性と一貫性 | 設計強度 / 設計思想の一貫性 / モジュール分割度 |
| [脆弱性レビュー](REVIEW_VULNERABILITY.md) | セキュリティ脆弱性とゼロトラスト評価 | 脆弱性 / ゼロトラスト強度 / セキュリティ強度 |
| [実装評価](REVIEW_IMPLEMENTATION.md) | コード品質・データ設計・運用信頼性 | コード品質 / データスキーマ / SRE |
| [不足機能評価](REVIEW_MISSING_FEATURES.md) | 機能改善案と不足機能の提案 | 機能改善 / 不足機能 |
| [品質保証レビュー](REVIEW_QUALITY.md) | テスト・性能・ライセンス・移植性・ドキュメント | テスト戦略 / 性能 / ライセンス / クロスプラットフォーム / ドキュメント完備性 |

---

## 総合評価 (Overall Assessment)

| # | レビュー観点 | 評価 | 重大指摘数 | ドキュメント |
|---|------------|------|-----------|------------|
| 1 | 脆弱性 | A~D | | [脆弱性レビュー](REVIEW_VULNERABILITY.md) |
| 2 | 設計強度 | A~D | | [設計レビュー](REVIEW_DESIGN.md) |
| 3 | 設計思想の一貫性 | A~D | | [設計レビュー](REVIEW_DESIGN.md) |
| 4 | モジュール分割度 | A~D | | [設計レビュー](REVIEW_DESIGN.md) |
| 5 | コード品質 | A~D | | [実装評価](REVIEW_IMPLEMENTATION.md) |
| 6 | データスキーマ | A~D | | [実装評価](REVIEW_IMPLEMENTATION.md) |
| 7 | 機能改善 | - | | [不足機能評価](REVIEW_MISSING_FEATURES.md) |
| 8 | 不足機能 | - | | [不足機能評価](REVIEW_MISSING_FEATURES.md) |
| 9 | SRE | A~D | | [実装評価](REVIEW_IMPLEMENTATION.md) |
| 10 | ゼロトラスト | A~D | | [脆弱性レビュー](REVIEW_VULNERABILITY.md) |
| 11 | セキュリティ | A~D | | [脆弱性レビュー](REVIEW_VULNERABILITY.md) |
| 12 | テスト戦略・カバレッジ | A~D | | [品質保証レビュー](REVIEW_QUALITY.md) |
| 13 | パフォーマンス・ベンチマーク | A~D | | [品質保証レビュー](REVIEW_QUALITY.md) |
| 14 | ライセンス遵守 | A~D | | [品質保証レビュー](REVIEW_QUALITY.md) |
| 15 | クロスプラットフォーム互換 | A~D | | [品質保証レビュー](REVIEW_QUALITY.md) |
| 16 | ドキュメント完備性 | A~D | | [品質保証レビュー](REVIEW_QUALITY.md) |

**評価基準:**
- **A**: 問題なし。ベストプラクティスに準拠
- **B**: 軽微な改善点あり。運用上の影響は低い
- **C**: 改善が必要。リリース前の対応を推奨
- **D**: 重大な問題あり。即時対応が必要
