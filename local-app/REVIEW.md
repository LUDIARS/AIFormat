# AI Code Review Format — ローカルアプリ

デスクトップ / CLI 等のローカル実行アプリ向けのレビューフォーマット。
[共通レビュー項目](../common/) に加え、ローカルアプリ固有の観点を適用する。

> ローカルアプリはセンシティブ情報（個人情報・認証情報・業務機密等）を扱う前提のため、
> 専用の[センシティブ情報取扱いポリシーレビュー](REVIEW_PRIVACY_POLICY.md)を必須項目として追加している。

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

### ローカルアプリ固有

| ドキュメント | 含まれるレビュー観点 |
|------------|-------------------|
| [センシティブ情報取扱いポリシーレビュー](REVIEW_PRIVACY_POLICY.md) | データ分類 / 保存・メモリ・送信時の保護 / 保持・削除 / コンプライアンス |
| [ローカル脆弱性レビュー](REVIEW_VULNERABILITY_LOCAL.md) | ローカル攻撃面 / 権限・サンドボックス / IPC / アップデート完全性 |
| [ローカル実装評価](REVIEW_IMPLEMENTATION_LOCAL.md) | ローカルデータストア / バックアップ・移行 / 運用信頼性 |
| [ローカル品質保証レビュー](REVIEW_QUALITY_LOCAL.md) | パフォーマンス / クロスプラットフォーム |

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
| 11 | センシティブ情報取扱いポリシー | ローカル | A~D | | [ポリシーレビュー](REVIEW_PRIVACY_POLICY.md) |
| 12 | ローカル攻撃面 | ローカル | A~D | | [ローカル脆弱性レビュー](REVIEW_VULNERABILITY_LOCAL.md) |
| 13 | 権限・サンドボックス | ローカル | A~D | | [ローカル脆弱性レビュー](REVIEW_VULNERABILITY_LOCAL.md) |
| 14 | アップデート完全性 | ローカル | A~D | | [ローカル脆弱性レビュー](REVIEW_VULNERABILITY_LOCAL.md) |
| 15 | ローカルデータストア | ローカル | A~D | | [ローカル実装評価](REVIEW_IMPLEMENTATION_LOCAL.md) |
| 16 | 運用信頼性 | ローカル | A~D | | [ローカル実装評価](REVIEW_IMPLEMENTATION_LOCAL.md) |
| 17 | パフォーマンス | ローカル | A~D | | [ローカル品質保証レビュー](REVIEW_QUALITY_LOCAL.md) |
| 18 | クロスプラットフォーム互換 | ローカル | A~D | | [ローカル品質保証レビュー](REVIEW_QUALITY_LOCAL.md) |

**評価基準:**
- **A**: 問題なし。ベストプラクティスに準拠
- **B**: 軽微な改善点あり。運用上の影響は低い
- **C**: 改善が必要。リリース前の対応を推奨
- **D**: 重大な問題あり。即時対応が必要
