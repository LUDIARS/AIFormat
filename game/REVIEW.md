# AI Code Review Format — ゲームプログラム

クライアントゲーム（PC / コンソール / モバイル）向けのレビューフォーマット。
[共通レビュー項目](../common/) に加え、ゲーム固有の観点を適用する。

> **Web サービスには適用できるが、ゲーム（特にクライアント単体）では無視できるレベルの観点は除外している。**
> 除外した観点と理由:
> - **ゼロトラスト（mTLS / マイクロセグメンテーション）** — サービス間通信を持たないクライアントゲームでは対象外
> - **SRE のクラウド運用（ヘルスチェック / 水平スケーリング / SLI・SLO / ロールバックデプロイ）** — 常駐サーバを持たないため対象外
> - **CORS / CSP / セキュリティヘッダ** — ブラウザ実行の Web フロントエンドを持たないため対象外
> - **SQLi / XSS / SSRF** — サーバサイド DB・Web レンダリングを持たないため対象外（コードレベル脆弱性は共通項目で評価）
>
> ゲームにバックエンド / Web API / ブラウザ製ゲームの要素がある場合は、その部分について [web/](../web/) のドキュメントを併用する。

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
| [脆弱性レビュー（共通）](../common/REVIEW_VULNERABILITY.md) | コードレベル脆弱性 / CI/CD・サプライチェーン |
| [品質保証レビュー](../common/REVIEW_QUALITY.md) | テスト戦略 / ライセンス遵守 / ドキュメント完備性 |
| [AI 活用レビュー](../common/REVIEW_AI.md) | LLM 機能のセキュリティ / AI 生成コードの検収 |
| [不足機能評価](../common/REVIEW_MISSING_FEATURES.md) | 機能改善 / 不足機能 |

### ゲーム固有

| ドキュメント | 含まれるレビュー観点 |
|------------|-------------------|
| [ゲーム脆弱性レビュー](REVIEW_VULNERABILITY_GAME.md) | クライアント信頼境界 / チート対策 / セーブ・課金保護 / マルチプレイ通信 |
| [ゲーム実装評価](REVIEW_IMPLEMENTATION_GAME.md) | セーブデータ設計 / アセット・リソース管理 / データ駆動設計 |
| [ゲーム品質保証レビュー](REVIEW_QUALITY_GAME.md) | ゲームパフォーマンス / プラットフォーム互換 / アクセシビリティ・ローカライズ |

---

## 総合評価 (Overall Assessment)

| # | レビュー観点 | 区分 | 評価 | 重大指摘数 | ドキュメント |
|---|------------|------|------|-----------|------------|
| 1 | 設計強度 | 共通 | A~D | | [設計レビュー](../common/REVIEW_DESIGN.md) |
| 2 | 設計思想の一貫性 | 共通 | A~D | | [設計レビュー](../common/REVIEW_DESIGN.md) |
| 3 | モジュール分割度 | 共通 | A~D | | [設計レビュー](../common/REVIEW_DESIGN.md) |
| 4 | コード品質 | 共通 | A~D | | [コード品質レビュー](../common/REVIEW_CODE_QUALITY.md) |
| 5 | コードレベル脆弱性 | 共通 | A~D | | [脆弱性レビュー（共通）](../common/REVIEW_VULNERABILITY.md) |
| 6 | CI/CD・サプライチェーン | 共通 | A~D | | [脆弱性レビュー（共通）](../common/REVIEW_VULNERABILITY.md) |
| 7 | テスト戦略・カバレッジ | 共通 | A~D | | [品質保証レビュー](../common/REVIEW_QUALITY.md) |
| 8 | ライセンス遵守 | 共通 | A~D | | [品質保証レビュー](../common/REVIEW_QUALITY.md) |
| 9 | ドキュメント完備性 | 共通 | A~D | | [品質保証レビュー](../common/REVIEW_QUALITY.md) |
| 10 | LLM 機能のセキュリティ | 共通 | A~D / 対象外 | | [AI 活用レビュー](../common/REVIEW_AI.md) |
| 11 | AI 生成コードの検収 | 共通 | A~D | | [AI 活用レビュー](../common/REVIEW_AI.md) |
| 12 | 機能改善 | 共通 | - | | [不足機能評価](../common/REVIEW_MISSING_FEATURES.md) |
| 13 | 不足機能 | 共通 | - | | [不足機能評価](../common/REVIEW_MISSING_FEATURES.md) |
| 14 | クライアント信頼境界 | ゲーム | A~D | | [ゲーム脆弱性レビュー](REVIEW_VULNERABILITY_GAME.md) |
| 15 | チート対策 | ゲーム | A~D | | [ゲーム脆弱性レビュー](REVIEW_VULNERABILITY_GAME.md) |
| 16 | セーブ・課金保護 | ゲーム | A~D | | [ゲーム脆弱性レビュー](REVIEW_VULNERABILITY_GAME.md) |
| 17 | マルチプレイ通信 | ゲーム | A~D | | [ゲーム脆弱性レビュー](REVIEW_VULNERABILITY_GAME.md) |
| 18 | セーブデータ設計 | ゲーム | A~D | | [ゲーム実装評価](REVIEW_IMPLEMENTATION_GAME.md) |
| 19 | アセット・リソース管理 | ゲーム | A~D | | [ゲーム実装評価](REVIEW_IMPLEMENTATION_GAME.md) |
| 20 | データ駆動設計 | ゲーム | A~D | | [ゲーム実装評価](REVIEW_IMPLEMENTATION_GAME.md) |
| 21 | ゲームパフォーマンス | ゲーム | A~D | | [ゲーム品質保証レビュー](REVIEW_QUALITY_GAME.md) |
| 22 | プラットフォーム互換 | ゲーム | A~D | | [ゲーム品質保証レビュー](REVIEW_QUALITY_GAME.md) |
| 23 | アクセシビリティ・ローカライズ | ゲーム | A~D | | [ゲーム品質保証レビュー](REVIEW_QUALITY_GAME.md) |

> マルチプレイ通信 (行 17) はオンライン要素がない場合、LLM 機能のセキュリティ (行 10) は
> LLM 機能が無い場合に「対象外」とする。

**評価基準**（重大度の定義・導出ルール・対象外の扱いは [REVIEW.md「評価の決定ルール」](../REVIEW.md#評価の決定ルール) を正本とする）:
- **A**: 指摘 0 件。チェック項目をすべて満たす
- **B**: Medium / Low の指摘のみ。運用上の影響は低い
- **C**: High の指摘が 1 件以上。リリース前の対応を推奨
- **D**: Critical の指摘が 1 件以上。即時対応が必要
