# 品質保証レビュー（共通） (Quality Assurance Review — Common)

全スタイル共通。対象リポジトリ・PR 情報を記載し、テスト・ライセンス・ドキュメントを評価する。

> パフォーマンスとクロスプラットフォーム互換はスタイルごとに観点が大きく異なるため、各スタイルのドキュメントで扱う。
> - Web: [web/REVIEW_QUALITY_WEB.md](../web/REVIEW_QUALITY_WEB.md)
> - ローカルアプリ: [local-app/REVIEW_QUALITY_LOCAL.md](../local-app/REVIEW_QUALITY_LOCAL.md)
> - ゲーム: [game/REVIEW_QUALITY_GAME.md](../game/REVIEW_QUALITY_GAME.md)

| 項目 | 値 |
|------|-----|
| リポジトリ | |
| 対象ブランチ / PR | |
| レビュー実施日 | |
| 対象コミット範囲 | |

---

## 1. テスト戦略・カバレッジ (Test Strategy & Coverage)

unit / integration / E2E のレベル別にテストの有無と実効性を評価する。

| 評価 | 観点 | 所見 |
|------|------|------|
| A~D | unit テストの網羅性 | |
| A~D | integration テストの網羅性 | |
| A~D | E2E テストの存在 | |
| A~D | エッジケース・境界値テスト | |
| A~D | CI でのテスト自動実行 | |

### チェック項目

- [ ] コアロジックに対する unit テストが存在するか
- [ ] 外部 I/O (DB, ファイル, ネットワーク) を含む integration テストがあるか
- [ ] 主要ユーザーフローを通す E2E テスト or smoke テストがあるか
- [ ] 並行性・タイミング依存のロジックに timing-safe なテストがあるか
- [ ] 失敗系・例外系のテストが網羅されているか (異常パス)
- [ ] CI で全テストが毎コミット green を求められているか
- [ ] flaky test の検出・隔離プロセスがあるか
- [ ] カバレッジ計測ツールが組み込まれていて、目標値が定義されているか
- [ ] モック・スタブが現実の挙動からドリフトしていないか (contract test 等)

---

## 2. ライセンス遵守・OSS 帰属表示 (License Compliance)

依存ライブラリのライセンス互換性と、配布物への帰属表示の妥当性を確認する。

| 該当依存 | ライセンス | 配布形態 | 互換性評価 | 帰属表示状態 |
|---------|----------|---------|-----------|-------------|
| `crate / npm / etc.` | MIT / Apache / GPL 等 | static / dynamic / SaaS | OK / 要対応 / NG | 対応済 / 未対応 |

### チェック項目

- [ ] プロジェクトのライセンスが明記されているか (`LICENSE` ファイル + README)
- [ ] 依存パッケージのライセンスが許諾範囲を超えていないか (GPL の取り込み等)
- [ ] バンドル配布する OSS について `NOTICE` / `THIRD_PARTY_LICENSES` 等で帰属表示しているか
- [ ] 商用配布前提なら CLA / DCO の運用が定まっているか
- [ ] プロプライエタリ依存が利用規約を満たしているか
- [ ] 配布バイナリに copyleft 由来のコード混入が無いか (cargo-deny, license-checker 等で機械チェック)
- [ ] OSS のフォントやアイコン・アセットの再配布条件を満たしているか
- [ ] AI 生成コードの取り込みについてプロジェクト方針が明文化されているか

---

## 3. ドキュメント完備性 (Documentation Completeness)

リポジトリの README / DESIGN / API / inline ドキュメントが揃っているかを評価する。

| 評価 | 観点 | 所見 |
|------|------|------|
| A~D | README の網羅性 | |
| A~D | DESIGN / アーキテクチャ図 | |
| A~D | API / インターフェースリファレンス | |
| A~D | inline コメントの粒度 | |
| A~D | 開発者向け CONTRIBUTING / ランブック | |
| A~D | spec/ ドキュメント充実度 (data/feature/interface/setup/test) | |

### チェック項目

- [ ] README にプロジェクト概要・前提・最短起動手順があるか
- [ ] DESIGN.md / ADR (Architecture Decision Record) が重要決定について残されているか
- [ ] API (REST / gRPC / IPC / 内部 trait) のリファレンスが自動生成 or 手書きで整備されているか
- [ ] 公開関数・公開 trait に doc コメント (`///`, JSDoc 等) が付いているか
- [ ] CHANGELOG / リリースノートが運用されているか
- [ ] 障害発生時のランブック / トラブルシューティングがあるか
- [ ] サンプルコード / examples がビルド可能で陳腐化していないか
- [ ] ドキュメントが実装と乖離していないか (CI で doc test / lint を回しているか)
- [ ] `spec/` が [`FORMAT_SPEC.md`](../FORMAT_SPEC.md) の標準8分類を基本に、各フォルダの責務が説明可能な構造になっているか
      — 分類は拡張可能。標準5分類の欠落は [`scripts/check-spec-structure.mjs`](../scripts/check-spec-structure.mjs) が warning を出す。
      `spec/data/` を巻き込む無アンカー `.gitignore data/` の実害だけは CI で落とす。レビューでは下記の **充実度 (該当性の判断)** に注力する
- [ ] **ドキュメント充実度**: `plan`/`faq`/`knowledge` を除く 5 分類が、そのプロジェクトに該当する範囲をカバーしているか (DB があるのに `data/` が無い等は不充実)
      — 欠落の検知手順と自動生成は [`prompt/SPEC_GAP.md`](../prompt/SPEC_GAP.md) (シグナル方式の突合。検知レポートを本観点の指摘として転記できる)
- [ ] `feature/` が 1 機能 1 ファイルで主要機能を網羅しているか

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | テスト戦略・カバレッジ | A~D | |
| 2 | ライセンス遵守・OSS 帰属表示 | A~D | |
| 3 | ドキュメント完備性 | A~D | |

**評価基準**（重大度の定義・導出ルール・対象外の扱いは [REVIEW.md「評価の決定ルール」](../REVIEW.md#評価の決定ルール) を正本とする）:
- **A**: 指摘 0 件。チェック項目をすべて満たす
- **B**: Medium / Low の指摘のみ。運用上の影響は低い
- **C**: High の指摘が 1 件以上。リリース前の対応を推奨
- **D**: Critical の指摘が 1 件以上。即時対応が必要
