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
| [ローカル脆弱性レビュー](REVIEW_VULNERABILITY_LOCAL.md) | ローカル攻撃面 / 権限・サンドボックス / IPC・ローカルサーバ / アップデート・配布の完全性 / アンチタンパリング |
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
| 14 | IPC・ローカルサーバ | ローカル | A~D | | [ローカル脆弱性レビュー](REVIEW_VULNERABILITY_LOCAL.md) |
| 15 | アップデート・配布の完全性 | ローカル | A~D | | [ローカル脆弱性レビュー](REVIEW_VULNERABILITY_LOCAL.md) |
| 16 | アンチタンパリング | ローカル | A~D | | [ローカル脆弱性レビュー](REVIEW_VULNERABILITY_LOCAL.md) |
| 17 | ローカルデータストア | ローカル | A~D | | [ローカル実装評価](REVIEW_IMPLEMENTATION_LOCAL.md) |
| 18 | バックアップ・移行 | ローカル | A~D | | [ローカル実装評価](REVIEW_IMPLEMENTATION_LOCAL.md) |
| 19 | 運用信頼性 | ローカル | A~D | | [ローカル実装評価](REVIEW_IMPLEMENTATION_LOCAL.md) |
| 20 | パフォーマンス | ローカル | A~D | | [ローカル品質保証レビュー](REVIEW_QUALITY_LOCAL.md) |
| 21 | クロスプラットフォーム互換 | ローカル | A~D | | [ローカル品質保証レビュー](REVIEW_QUALITY_LOCAL.md) |

> センシティブ情報取扱いポリシー (行 11) は、ポリシーレビュー内 8 観点の指摘を
> まとめて最悪重大度から導出する**集約行**とする (8 観点の個別評価はドキュメント側で管理)。

**評価基準**（重大度の定義・導出ルール・対象外の扱いは [REVIEW.md「評価の決定ルール」](../REVIEW.md#評価の決定ルール) を正本とする）:
- **A**: 指摘 0 件。チェック項目をすべて満たす
- **B**: Medium / Low の指摘のみ。運用上の影響は低い
- **C**: High の指摘が 1 件以上。リリース前の対応を推奨
- **D**: Critical の指摘が 1 件以上。即時対応が必要
