# 品質保証レビュー (Quality Assurance Review)

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/AIFormat |
| 対象ブランチ / PR | main |
| レビュー実施日 | 2026-05-13 |
| 対象コミット範囲 | 016c0a7 .. f3f8ff4 |

---

## 1. テスト戦略・カバレッジ (Test Strategy & Coverage)

| 評価 | 観点 | 所見 |
|------|------|------|
| D | unit テストの網羅性 | `git ls-files` 全 31 ファイル中、 テストファイル 0。 `scripts/*.mjs` の関数 (loadKeywords, shouldIgnoreFile, hasBom, analyzeRepo, relativeTime 等) 全て unit テスト無し |
| D | integration テストの網羅性 | sync.sh が CLAUDE.md を破壊しないことを検証する integration テスト無し |
| D | E2E テストの存在 | `env-leak-checker serve` の API/GUI に対する E2E (Playwright 等) 無し |
| D | エッジケース・境界値テスト | `env-leak-keywords.json` 不正 JSON、 巨大ファイル、 シンボリックリンクループ等の境界値テスト無し |
| D | CI でのテスト自動実行 | `.github/workflows/` 自体が存在しない (`git ls-files` で確認済) |

### チェック項目

- [ ] コアロジックに対する unit テストが存在するか
- [ ] 外部 I/O (DB, ファイル, ネットワーク) を含む integration テストがあるか
- [ ] 主要ユーザーフローを通す E2E テスト or smoke テストがあるか
- [ ] 並行性・タイミング依存のロジックに timing-safe なテストがあるか
- [ ] 失敗系・例外系のテストが網羅されているか
- [ ] CI で全テストが毎コミット green を求められているか
- [ ] flaky test の検出・隔離プロセスがあるか
- [ ] カバレッジ計測ツールが組み込まれていて、目標値が定義されているか
- [ ] モック・スタブが現実の挙動からドリフトしていないか
- [ ] OS / ブラウザ / ランタイムのマトリクステストが必要なら実施されているか

---

## 2. パフォーマンス・ベンチマーク (Performance & Benchmark)

| 評価 | 観点 | 所見 |
|------|------|------|
| C | パフォーマンス要件の明文化 | scan の目標時間 (`<1s/repo`?) 等の SLO が未定義 |
| C | ベンチマーク実装 | `env-leak-checker.mjs:158, 343-353` で per-repo ms 計測しコンソール出力するが、 ベンチ結果の永続化・回帰検出無し |
| D | プロファイリング (CPU / メモリ / I/O) | flamegraph / heap snapshot 一切なし |
| D | 性能リグレッション検知 | CI が無いため自動検知不能 |
| C | 大規模データ・高負荷時の挙動 | 28 リポ × 数千ファイルの実測あり (`-v` で表示) も 100K ファイル超では未検証 |

### チェック項目

- [ ] レイテンシ・スループット・メモリ使用量の目標値が文書化されているか
- [ ] ベンチマーク (`cargo bench` / `vitest bench` / `pytest-benchmark` 等) が存在するか
- [ ] ホットパスがプロファイリングで特定されているか
- [ ] リグレッションを CI で自動検出する仕組みがあるか
- [ ] 大量データ・大量同時接続時の挙動が検証されているか
- [ ] メモリリーク・ファイルディスクリプタリークが起きないことが確認されているか — `walkDir` は同期 readdirSync で fd リークは出にくいが、 `utf8bom.mjs` の async readdir はループ中の例外でハンドル漏れ可能性
- [ ] アロケーション削減・キャッシュ戦略が必要箇所で導入されているか — `env-leak-checker.mjs:135` で `contentLower` 全文 lower 化、 大ファイルでメモリ倍増
- [ ] 起動時間 / cold start / warm start が許容範囲か
- [x] バッテリー消費 / モバイル省電力 — 非該当

---

## 3. ライセンス遵守・OSS 帰属表示 (License Compliance)

| 該当依存 | ライセンス | 配布形態 | 互換性評価 | 帰属表示状態 |
|---------|----------|---------|-----------|-------------|
| `node:http` / `node:fs` / `node:path` (Node.js builtin) | MIT (Node.js) | 動的 (ランタイム提供) | OK | Node 配布時に帰属済 |
| `gh` CLI (外部呼出し) | MIT (GitHub CLI) | プロセス呼出し | OK | 帰属表示不要 (動的呼出し) |
| `git` (外部呼出し) | GPL-2.0 (但しプロセス呼出しのみ) | プロセス呼出し | OK | GPL 取込み無し |
| プロジェクト本体 | MIT (`LICENSE:1`) | source 配布 | OK | LICENSE 明記済 |

### チェック項目

- [x] プロジェクトのライセンスが明記されているか (`LICENSE` ファイル + README) — LICENSE は MIT で明記、 README は 1 行のみ (LICENSE 言及なし)
- [x] 依存パッケージのライセンスが許諾範囲を超えていないか
- [x] バンドル配布する OSS について `NOTICE` / `THIRD_PARTY_LICENSES` 等で帰属表示しているか — 第三者依存なしで NOTICE 不要
- [x] 商用配布前提なら CLA / DCO の運用が定まっているか — LUDIARS 全体方針に従う、 本リポ単独では未文書化
- [x] プロプライエタリ依存 — なし
- [x] 配布バイナリに copyleft 由来のコード混入が無いか — バイナリ配布なし
- [x] OSS のフォントやアイコンの再配布条件を満たしているか — 該当なし
- [ ] AI 生成コードの取り込みについてプロジェクト方針が明文化されているか — `RULE.md` / `CONTRIBUTING.md` に AI 生成コード方針記載なし

---

## 4. クロスプラットフォーム互換 (Cross-Platform Compatibility)

| 評価 | 観点 | 所見 |
|------|------|------|
| C | パス区切り・大文字小文字の扱い | `node:path` の `join` を使用し OK。 但し `env-leak-checker.mjs:99` の `relBase + "/" + entry.name` は Windows でも forward slash 固定 (意図的だが要確認) |
| D | プロセス・IPC の OS 別実装 | `sync.sh:55` の `sed -i` は BSD sed (macOS) で動かず GNU sed 専用、 PowerShell 版なし |
| B | 文字エンコーディング・改行コード | `utf8bom.mjs` 自体が BOM 整備ツール。 `sync.sh` は LF 固定で問題なし |
| C | ビルドツールチェーンの差分 | `package.json` 無しで npm script 経由実行不可、 OS 別差分の吸収レイヤ無し |
| D | CI でのマトリクス実行 | CI 自体が無い |

### チェック項目

- [x] パスを `/` ハードコードせず、`PathBuf` / `path.join` 等で組み立てているか — `path.join` 使用済
- [x] ファイル名の大文字小文字依存が NTFS / APFS / ext4 で問題にならないか — `env-leak-checker.mjs:138` で lowercase 比較
- [ ] CRLF ↔ LF / shebang / 実行ビット の OS 差を考慮しているか — `.sh` の shebang あるが Windows では git-bash 必須
- [x] Windows Named Pipe / Unix Domain Socket 等の OS 別 IPC を抽象化しているか — 該当なし
- [ ] ネイティブ依存 (cloudflared / clangd / cmake / GPU ドライバ) の前提が文書化されているか — `gh` / `git` 必要だが README 未記載
- [ ] CI が Windows / Linux / macOS マトリクスで毎コミット走るか
- [ ] arm64 / x86_64 等のアーキテクチャ間でも CI が回るか
- [ ] `RUST_LOG` 等の環境変数の設定方法が OS 別に文書化されているか — `LUDIARS_BASE` 環境変数の OS 別設定方法が README 未記載
- [ ] OS 別のインストール手順 — README 自体が空

---

## 5. ドキュメント完備性 (Documentation Completeness)

| 評価 | 観点 | 所見 |
|------|------|------|
| D | README の網羅性 | `README.md:1` が `# AIFormat` の 1 行のみ。 配布対象 / sync 手順 / scripts 一覧 / 環境変数 一切なし |
| C | DESIGN / アーキテクチャ図 | DESIGN.md / ADR ディレクトリ無し。 `RULE*.md` / `FORMAT_*.md` で代替 |
| C | API リファレンス | `env-leak-checker.mjs` の HTTP API (`/api/keywords`, `/api/scan`) の仕様文書なし、 コード内 JSDoc 無し |
| C | inline コメントの粒度 | スクリプトの section 区切りコメント (`── ファイル走査 ──`) は良好、 但し関数単位 JSDoc 無し |
| D | 開発者向け CONTRIBUTING / ランブック | CONTRIBUTING.md / RUNBOOK.md / CHANGELOG.md 不在 |

### チェック項目

- [ ] README にプロジェクト概要・前提・最短起動手順があるか
- [ ] DESIGN.md / ADR が重要決定について残されているか
- [ ] API リファレンスが自動生成 or 手書きで整備されているか
- [ ] 公開関数・公開 trait に doc コメントが付いているか
- [ ] CHANGELOG / リリースノートが運用されているか
- [x] 依存サービスとの連携手順 (Cernere / Nuntius 等) が文書化されているか — `RULE.md:1-12` で Cernere 言及済
- [ ] 障害発生時のランブック / トラブルシューティングがあるか
- [ ] サンプルコード / examples がビルド可能で陳腐化していないか — examples なし
- [ ] スクリーンショット / アーキテクチャ図 / シーケンス図が必要箇所にあるか
- [ ] ドキュメントが実装と乖離していないか — RULE.md は更新頻度高いがレビュー記録なし

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | テスト戦略・カバレッジ | D | 2 |
| 2 | パフォーマンス・ベンチマーク | C | 0 |
| 3 | ライセンス遵守・OSS 帰属表示 | A | 0 |
| 4 | クロスプラットフォーム互換 | C | 1 |
| 5 | ドキュメント完備性 | D | 1 |

**評価基準:** A 問題なし / B 軽微 / C 改善要 / D 重大
