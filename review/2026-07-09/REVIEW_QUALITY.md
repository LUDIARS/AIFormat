# 品質保証レビュー（共通） (Quality Assurance Review — Common)

全スタイル共通。対象リポジトリ・PR 情報を記載し、テスト・ライセンス・ドキュメントを評価する。

> パフォーマンスとクロスプラットフォーム互換はスタイル別ドキュメントで扱う観点であり、
> AIFormat は common-only スタイルのためこれらの観点自体が `scripts/scores-keys.json` の
> `common-only` キー列に含まれない（対象外ではなく「観点体系上そもそも存在しない」）。

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/AIFormat |
| 対象ブランチ / PR | claude/aiformat-review-audit-7bqy7r (working tree = HEAD) |
| レビュー実施日 | 2026-07-09 |
| 対象コミット範囲 | 086eb42 .. 518fdee |

---

## 1. テスト戦略・カバレッジ (Test Strategy & Coverage)

| 評価 | 観点 | 所見 |
|------|------|------|
| C | unit テストの網羅性 | `git ls-files \| grep -iE "test\|spec\."` で該当ファイル 0 件 (ヒットした `FORMAT_SPEC.md` / `RULE_TEST.md` / `scaffold-spec.mjs` 等はテストファイルではなく無関係)。`scripts/*.mjs` 14 本の関数 (`shouldIgnoreFile`, `hasBom`, `analyzeRepo`, `classify`, `extractColumnDefs` 等) に unit テストは 1 件も無い (QUALITY-001) |
| C | integration テストの網羅性 | `sync.sh` が `CLAUDE.md` を破壊しないことを検証する integration テスト無し。`check-*.mjs` 系が実際の壊れた `migrations/`・`spec/` 構造に対して正しく exit 1 することを確認する統合テストも無い (QUALITY-001) |
| C | E2E テストの存在 | `env-leak-checker serve` の HTTP API / GUI に対する E2E (Playwright 等) 無し (QUALITY-001) |
| C | エッジケース・境界値テスト | `env-leak-keywords.json` 不正 JSON・巨大ファイル・シンボリックリンクループ等の境界値テスト無し (QUALITY-001) |
| C | CI でのテスト自動実行 | `.github/workflows/harness.yml` → `harness-checks.yml` は `node .aiformat/scripts/harness-check.mjs .` (migrations/personal-data/spec-structure/latest-json の決定的チェック) のみを実行する。lint・typecheck・test のいずれのステップも無く、`check-*.mjs` 自身を含む `scripts/*.mjs` のどれも CI 上で構文・型・振る舞いを検証されない (QUALITY-001) |

### チェック項目

- [ ] コアロジックに対する unit テストが存在するか — 0 件 (QUALITY-001)
- [ ] 外部 I/O (DB, ファイル, ネットワーク) を含む integration テストがあるか — 0 件
- [ ] 主要ユーザーフローを通す E2E テスト or smoke テストがあるか — 0 件
- [x] 並行性・タイミング依存のロジックに timing-safe なテストがあるか — 該当ロジック (VULN-006 のレース) 自体が本質的に低頻度・低実害のため timing-safe テストの必要性は薄いと判断 (対象外に近いが、テストが 0 件である以上「有無」としては無し)
- [ ] 失敗系・例外系のテストが網羅されているか (異常パス) — 0 件
- [ ] CI で全テストが毎コミット green を求められているか — テストが存在しないため「求められている」状態にすら至っていない
- [x] flaky test の検出・隔離プロセスがあるか — テストが存在しないため対象外
- [ ] カバレッジ計測ツールが組み込まれていて、目標値が定義されているか — 未導入
- [x] モック・スタブが現実の挙動からドリフトしていないか — テストが無いため対象外

**QUALITY-001 (High)**: `.github/workflows/` に lint / typecheck / test のいずれの自動実行ステップも無く、`scripts/*.mjs` にテストファイルが 1 件も存在しない。`RULE_TEST.md` §1 は「全リポジトリは CI を持ち、最低限 lint / typecheck (or build) / test を自動実行する」を**必須**と定めるが、AIFormat 自身がこれを満たしていない。REVIEW.md 重大度表の High の例示「コアロジックのテスト皆無」に合致する。

---

## 2. ライセンス遵守・OSS 帰属表示 (License Compliance)

| 該当依存 | ライセンス | 配布形態 | 互換性評価 | 帰属表示状態 |
|---------|----------|---------|-----------|-------------|
| `node:*` builtin のみ (`scripts/*.mjs` の import を全数確認、npm 依存 0 件) | MIT (Node.js) | 動的 (ランタイム提供) | OK | Node 配布時に帰属済み、本リポジトリでの追加表示不要 |
| `gh` CLI (外部プロセス呼出し、`ludiars-pr.mjs`) | MIT (GitHub CLI) | プロセス呼出しのみ | OK | 帰属表示不要 (バンドルしない) |
| `git` (外部プロセス呼出し) | GPL-2.0 (ただしプロセス呼出しのみ) | プロセス呼出しのみ | OK | GPL コード取り込み無し |
| `actions/checkout@v4`, `actions/setup-node@v4` (CI) | MIT | CI 実行時のみ | OK | 帰属表示不要 |
| プロジェクト本体 | MIT (`LICENSE:1-3`) | source 配布 | OK | LICENSE 明記済み |

### チェック項目

- [ ] プロジェクトのライセンスが明記されているか (`LICENSE` ファイル + README) — `LICENSE` は MIT で明記済みだが `README.md` (全 37 行読了) に LICENSE への言及・リンクが無い (QUALITY-006)
- [x] 依存パッケージのライセンスが許諾範囲を超えていないか — 依存 0 件のため問題なし
- [x] バンドル配布する OSS について `NOTICE` 等で帰属表示しているか — バンドルする third-party コードが無いため対象外 (NOTICE 不要)
- [x] 商用配布前提なら CLA / DCO の運用が定まっているか — 対象外 (LUDIARS 組織内の governance リポジトリで外部コントリビュータ受け入れ体制を取っていない。`CONTRIBUTING.md` 不在 (QUALITY-005) はドキュメント完備性側で計上)
- [x] プロプライエタリ依存が利用規約を満たしているか — プロプライエタリ依存無し
- [x] 配布バイナリに copyleft 由来のコード混入が無いか — バイナリ配布無し
- [x] OSS のフォントやアイコン・アセットの再配布条件を満たしているか — フォント/アイコン等の同梱資産無し
- [x] AI 生成コードの取り込みについてプロジェクト方針が明文化されているか — `HARNESS.md` §3.1〜§3.8 (フルセット実装・実経路裏取り・Definition of Done 等) が実質的な AI 生成コード検収方針として明文化されている (`common/REVIEW_AI.md` 側の AI-002 で「方針はあるが自己適用が不十分」を計上)

---

## 3. ドキュメント完備性 (Documentation Completeness)

| 評価 | 観点 | 所見 |
|------|------|------|
| B | README の網羅性 | `README.md` (37 行) は「入口」「ルール」「レビュー」「フォーマット」の 4 セクションで主要ドキュメントを索引している (前回 2026-05-13 は `# AIFormat` の 1 行のみだったため大幅改善 = 解消)。ただし `scripts/` ディレクトリ (14 ファイル、CI ゲート・CLI ツール本体) への言及が無く (QUALITY-003)、LICENSE への言及も無い (QUALITY-006) |
| B | DESIGN / アーキテクチャ図 | 独立した `DESIGN.md` / `docs/adr/` は無いが、`HARNESS.md` (257 行) が設計原則・配置ルールを ADR に近い密度で文書化しており実質的に代替している |
| B | API / インターフェースリファレンス | `scripts/HARNESS_CHECKS.md` が CI ゲート系スクリプトの入出力・exit code を文書化 (良好)。一方 `env-leak-checker.mjs` の HTTP API (`/api/keywords`, `/api/scan`, `/api/repos`) は `spec/interface/` 相当の文書が無い (QUALITY-002 の範囲) |
| B | inline コメントの粒度 | 各スクリプトの区切りコメント (`── ファイル走査 ──` 等) は良好。JSDoc 形式のヘッダコメントで Usage が示されている |
| B | 開発者向け CONTRIBUTING / ランブック | `CONTRIBUTING.md` / `CHANGELOG.md` が存在しない (`git ls-files` で確認、QUALITY-005)。障害時ランブックは常駐サービスを持たないため対象外と判断 |
| B | spec/ ドキュメント充実度 (data/feature/interface/setup/test) | `spec/` ディレクトリ自体が存在しない (`git ls-files \| grep "^spec/"` → 0 件)。`FORMAT_SPEC.md` は全プロジェクトに spec/ (7 分類) を求めており、AIFormat 自身がこの構造を自己適用していない (QUALITY-002) |

### チェック項目

- [x] README にプロジェクト概要・前提・最短起動手順があるか — 概要と各ドキュメントへの導線はあるが「最短起動手順」に相当する記述は無し (`scripts/` の使い方は `scripts/HARNESS_CHECKS.md` 側にあり README からリンクされていない、QUALITY-003 と関連)
- [x] DESIGN.md / ADR が重要決定について残されているか — `HARNESS.md` が代替
- [ ] API (REST / gRPC / IPC / 内部 trait) のリファレンスが自動生成 or 手書きで整備されているか — `env-leak-checker.mjs` の HTTP API は未文書化 (QUALITY-002)
- [x] 公開関数・公開 trait に doc コメント (`///`, JSDoc 等) が付いているか — ファイルヘッダの JSDoc 形式コメントで Usage は示されている (関数単位の JSDoc は無いが、関数が少なく可読性は保たれている)
- [ ] CHANGELOG / リリースノートが運用されているか — `CHANGELOG.md` 不在 (QUALITY-005)
- [x] 障害発生時のランブック / トラブルシューティングがあるか — 常駐サービスを持たないため対象外。`scripts/HARNESS_CHECKS.md`「誤検出の抑制」節がトラブルシューティングに相当する内容を提供
- [x] サンプルコード / examples がビルド可能で陳腐化していないか — 各スクリプトの JSDoc 内 Usage 例はコードと同一ファイルにあり乖離しにくい構造
- [ ] ドキュメントが実装と乖離していないか (CI で doc test / lint を回しているか) — `FORMAT_SPEC.md` が「7 分類」と定義したにもかかわらず `README.md:35` / `HARNESS.md:105,250` / `common/REVIEW_QUALITY.md:89` / `scripts/check-spec-structure.mjs:6,9,62` / `scripts/scaffold-spec.mjs:65` の計 6 箇所が「6 分類」のまま (`faq/` を含めない列挙) で乖離している (QUALITY-004)。ドキュメントの lint/整合チェックは CI に無い
- [ ] `spec/` が [`FORMAT_SPEC.md`](../../FORMAT_SPEC.md) の 7 分類に整理されているか — `spec/` 自体が不在 (QUALITY-002)
- [ ] **ドキュメント充実度**: `plan`/`faq` を除く 5 分類が該当範囲をカバーしているか — 同上、未整備
- [x] `feature/` が 1 機能 1 ファイルで主要機能を網羅しているか — `spec/feature/` が無いため厳密な該当性は判断不能だが、AIFormat の「機能」は各 `RULE_*.md`/`REVIEW_*.md`/`scripts/*.mjs` 自体がドキュメントとして機能を代替しており、伝統的な意味の「feature」概念とは性質が異なる。QUALITY-002 の範囲内として扱い独立指摘はしない

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | テスト戦略・カバレッジ | C | 1 |
| 2 | ライセンス遵守・OSS 帰属表示 | B | 0 |
| 3 | ドキュメント完備性 | B | 0 |

**評価基準**（重大度の定義・導出ルール・対象外の扱いは [REVIEW.md「評価の決定ルール」](../../REVIEW.md#評価の決定ルール) を正本とする）:
- **A**: 指摘 0 件。チェック項目をすべて満たす
- **B**: Medium / Low の指摘のみ。運用上の影響は低い
- **C**: High の指摘が 1 件以上。リリース前の対応を推奨
- **D**: Critical の指摘が 1 件以上。即時対応が必要

## 指摘一覧 (このドキュメント分)

| ID | 節 | 重大度 | 該当箇所 | 概要 |
|----|----|--------|----------|------|
| QUALITY-001 | §1 | High | CI ワークフロー全体, `scripts/` (テスト0件) | lint/typecheck/test の CI 実行が皆無 |
| QUALITY-002 | §3 | Medium | `spec/` (不在) | FORMAT_SPEC.md の 7 分類を自己適用していない |
| QUALITY-003 | §3 | Low | `README.md:1-37` | `scripts/` ディレクトリが README 索引から欠落 |
| QUALITY-004 | §3 | Medium | `README.md:35`, `HARNESS.md:105,250`, `common/REVIEW_QUALITY.md:89`, `scripts/check-spec-structure.mjs:6,9,62`, `scripts/scaffold-spec.mjs:65` | 「6 分類」表記のドキュメントドリフト (正本は 7 分類) |
| QUALITY-005 | §3 | Low | (CONTRIBUTING.md/CHANGELOG.md 不在) | 開発者向けドキュメント不足 |
| QUALITY-006 | §2 | Low | `README.md:1-37` | README に LICENSE への言及が無い |
