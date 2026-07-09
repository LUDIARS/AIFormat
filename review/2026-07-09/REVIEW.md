# AI Code Review Format — フルレビュー総合サマリ

**スタイル判定: common-only（根拠: AIFormat はゲームクライアント/Web サービス/ローカルアプリのいずれにも該当しない
「ライブラリ・規約集・スクリプト集」であり、[REVIEW.md「スタイル判定」](../../REVIEW.md#スタイル判定) 4 番目の規定により
共通レビュー項目のみを適用する。専用の総合評価表を持たないため、本ファイルが
[`scripts/scores-keys.json`](../../scripts/scores-keys.json) の `common-only` キー列順に
common 各ドキュメントの総合評価を連結する）**

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/AIFormat |
| 対象ブランチ / PR | `claude/aiformat-review-audit-7bqy7r` (working tree = `/home/user/AIFormat` の HEAD) |
| レビュー実施日 | 2026-07-09 |
| 対象コミット範囲 | `086eb42` (このブランチの最古コミット) .. `518fdee` (HEAD) |

> **レビュー範囲の注記**: 本タスクは「working tree = /home/user/AIFormat」を対象と明示されており、
> このセッションのチェックアウトは `claude/aiformat-review-audit-7bqy7r` ブランチ (HEAD `518fdee`,
> コミットメッセージ "Merge already-squash-merged branch history") である。`origin/main` の最新
> (`810b456`) と比較すると `scripts/scores-keys.json` の新設・`scripts/check-latest-json.mjs` の
> `format_version`/`SCORES_KEYS_MISMATCH` 検査ロジック・`REVIEW.md` の該当記述など計 6 ファイルに
> 差分があり、working tree 側がより新しい (`format_version: 2` 関連の仕組みを含む) 状態になっている。
> 本レビューはタスク指示 (working tree を対象とする・`scores-keys.json` のキー列に従う) に厳密に従い、
> **working tree (HEAD 518fdee) の内容**を対象として実施した。`origin/main` 側にこれらの差分が
> 未反映であること自体は本レビューの指摘対象にしない (ブランチ間の同期状況はレビュー対象リポジトリの
> コード品質とは別軸のため)。

---

## レビュードキュメント一覧 (common/)

| ドキュメント | 含まれるレビュー観点 |
|------------|-------------------|
| [設計レビュー](REVIEW_DESIGN.md) | 設計強度 / 設計思想の一貫性 / モジュール分割度 |
| [コード品質レビュー](REVIEW_CODE_QUALITY.md) | コード品質 |
| [脆弱性レビュー（共通）](REVIEW_VULNERABILITY.md) | コードレベル脆弱性 / CI/CD・サプライチェーン |
| [品質保証レビュー](REVIEW_QUALITY.md) | テスト戦略 / ライセンス遵守 / ドキュメント完備性 |
| [AI 活用レビュー](REVIEW_AI.md) | LLM 機能のセキュリティ / AI 生成コードの検収 |
| [不足機能評価](REVIEW_MISSING_FEATURES.md) | 機能改善 / 不足機能 |

web / local-app / game 固有ドキュメントは併用しない（該当する成果物が本リポジトリに存在しないため対象外）。

---

## 総合評価 (Overall Assessment)

`scripts/scores-keys.json` の `common-only` キー列の順序に従う。

| # | scores キー | レビュー観点 | 評価 | 重大指摘数 | ドキュメント |
|---|------------|------------|------|-----------|------------|
| 1 | `design_robustness` | 設計強度 | B | 0 | [設計レビュー](REVIEW_DESIGN.md) |
| 2 | `design_consistency` | 設計思想の一貫性 | B | 0 | [設計レビュー](REVIEW_DESIGN.md) |
| 3 | `modularity` | モジュール分割度 | B | 0 | [設計レビュー](REVIEW_DESIGN.md) |
| 4 | `code_quality` | コード品質 | B | 0 | [コード品質レビュー](REVIEW_CODE_QUALITY.md) |
| 5 | `code_vulnerability` | コードレベル脆弱性 | B | 0 | [脆弱性レビュー](REVIEW_VULNERABILITY.md) |
| 6 | `cicd_supply_chain` | CI/CD・サプライチェーン | B | 0 | [脆弱性レビュー](REVIEW_VULNERABILITY.md) |
| 7 | `test_coverage` | テスト戦略・カバレッジ | C | 1 | [品質保証レビュー](REVIEW_QUALITY.md) |
| 8 | `license` | ライセンス遵守 | B | 0 | [品質保証レビュー](REVIEW_QUALITY.md) |
| 9 | `documentation` | ドキュメント完備性 | B | 0 | [品質保証レビュー](REVIEW_QUALITY.md) |
| 10 | `llm_security` | LLM 機能のセキュリティ | 対象外 | 対象外 | [AI 活用レビュー](REVIEW_AI.md) |
| 11 | `ai_code_acceptance` | AI 生成コードの検収 | B | 0 | [AI 活用レビュー](REVIEW_AI.md) |
| — | (評価軸なし) | 機能改善 | - | High: 1 | [不足機能評価](REVIEW_MISSING_FEATURES.md) |
| — | (評価軸なし) | 不足機能 | - | High: 4 | [不足機能評価](REVIEW_MISSING_FEATURES.md) |

**評価基準**（重大度の定義・導出ルール・対象外の扱いは [REVIEW.md「評価の決定ルール」](../../REVIEW.md#評価の決定ルール) を正本とする）:
- **A**: 指摘 0 件。チェック項目をすべて満たす
- **B**: Medium / Low の指摘のみ。運用上の影響は低い
- **C**: High の指摘が 1 件以上。リリース前の対応を推奨
- **D**: Critical の指摘が 1 件以上。即時対応が必要

---

## 全指摘一覧 (ID 一覧)

| ID | ドキュメント | 節 | 重大度 | file:line | 概要 |
|----|------------|----|--------|-----------|------|
| DESIGN-001 | REVIEW_DESIGN §2 | 設計思想の一貫性 | Medium | `sync.sh:1`, `sync-local.sh:1` | bash 専用で Windows ネイティブ非対応 |
| DESIGN-002 | REVIEW_DESIGN §3 | モジュール分割度 | Low | `sync.sh:37-76`, `sync-local.sh:29-86` | スキルコピー + CLAUDE.md 編集ロジックの重複 |
| DESIGN-003 | REVIEW_DESIGN §2 | 設計思想の一貫性 | Medium | `env-leak-checker.mjs:32` 他 3 箇所 | 個人環境パスのハードコードフォールバック |
| DESIGN-004 | REVIEW_DESIGN §1 | 設計強度 | Low | `env-leak-checker.mjs:279-369` | HTTP server にタイムアウト機構が無い |
| DESIGN-005 | REVIEW_DESIGN §1 | 設計強度 | Medium | `sync.sh:54-56`, `sync-local.sh:62-67` | CLAUDE.md 書き換え前にバックアップを取らない |
| DESIGN-006 | REVIEW_DESIGN §3 | モジュール分割度 | Low | `env-leak-checker.mjs` 全体 | CLI/HTTP API/HTML の 3 責務が 1 ファイルに同居 |
| CODEQ-001 | REVIEW_CODE_QUALITY §1 | コード品質 | Low | `env-leak-checker.mjs:27` | 未使用 import `resolve` |
| CODEQ-002 | REVIEW_CODE_QUALITY §1 | コード品質 | Low | `env-leak-checker.mjs:224` | デッドコード (到達不能な `-v` 二重フィルタ) |
| CODEQ-003 | REVIEW_CODE_QUALITY §1 | コード品質 | Low | `repo-status.mjs:23-33`, `ludiars-pr.mjs:15-26` | 例外握りつぶし (理由コメント無し) |
| CODEQ-004 | REVIEW_CODE_QUALITY §1 | コード品質 | Low | `env-leak-checker.mjs:576,578` | マジックナンバー `7700` 未定数化 |
| CODEQ-005 | REVIEW_CODE_QUALITY §1 | コード品質 | Low | `env-leak-checker.mjs:138,145` | 二重 `toLowerCase()` 計算 |
| CODEQ-006 | REVIEW_CODE_QUALITY §1 | コード品質 | Low | `utf8bom.mjs:166` | `✓` 絵文字の直書き |
| VULN-001 | REVIEW_VULNERABILITY §1 | コードレベル脆弱性 | Medium | `env-leak-checker.mjs:295-350,376-388` | CSRF + パストラバーサル (Origin/CSRF検証なし) |
| VULN-002 | REVIEW_VULNERABILITY §1 | コードレベル脆弱性 | Low | `env-leak-checker.mjs:295-304,123` | `body.keyword` 型検証不足 |
| VULN-003 | REVIEW_VULNERABILITY §2 | CI/CD・サプライチェーン | Medium | `harness.yml:8-17`, `harness-checks.yml:27-48` | ワークフロー `permissions` 未指定 |
| VULN-004 | REVIEW_VULNERABILITY §2 | CI/CD・サプライチェーン | Low | `harness-checks.yml:32,35,43` | action が commit SHA 未ピン留め |
| VULN-005 | REVIEW_VULNERABILITY §2 | CI/CD・サプライチェーン | Medium | `.github/workflows/*.yml` | secret 混入スキャンが CI 未接続 |
| VULN-006 | REVIEW_VULNERABILITY §1 | コードレベル脆弱性 | Low | `env-leak-checker.mjs:42-51,295-313` | keyword ファイルの同時書込みレース |
| VULN-007 | REVIEW_VULNERABILITY §1 | コードレベル脆弱性 | Low | `ludiars-pr.mjs:18-22,30-33`, `repo-status.mjs:25-29,74` | `execSync` テンプレートリテラル (shell 経由) |
| VULN-008 | REVIEW_VULNERABILITY §1 | コードレベル脆弱性 | Low (未確認) | `env-leak-keywords.json:3` | 個人名らしき既定 keyword の残存 |
| QUALITY-001 | REVIEW_QUALITY §1 | テスト戦略・カバレッジ | **High** | CI ワークフロー全体, `scripts/` | lint/typecheck/test の CI 実行が皆無、テスト0件 |
| QUALITY-002 | REVIEW_QUALITY §3 | ドキュメント完備性 | Medium | `spec/` (不在) | FORMAT_SPEC.md の 7 分類を自己適用していない |
| QUALITY-003 | REVIEW_QUALITY §3 | ドキュメント完備性 | Low | `README.md:1-37` | `scripts/` ディレクトリが README 索引から欠落 |
| QUALITY-004 | REVIEW_QUALITY §3 | ドキュメント完備性 | Medium | `README.md:35` 他 5 箇所 | 「6 分類」表記のドキュメントドリフト (正本は 7 分類) |
| QUALITY-005 | REVIEW_QUALITY §3 | ドキュメント完備性 | Low | (CONTRIBUTING.md/CHANGELOG.md 不在) | 開発者向けドキュメント不足 |
| QUALITY-006 | REVIEW_QUALITY §2 | ライセンス遵守 | Low | `README.md:1-37` | README に LICENSE への言及が無い |
| AI-002 | REVIEW_AI §2 | AI 生成コードの検収 | Medium | `HARNESS.md:183-191`, `scripts/` | AI 生成コード検収方針を自リポジトリに自己適用できていない |

**合計 27 件** — Critical: 0 / High: 1 / Medium: 9 / Low: 17

---

## 観点別評価と重み付けスコアの計算過程

### 各観点の評価根拠 (最悪重大度から機械導出)

| scores キー | 該当指摘の重大度一覧 | 最悪重大度 | 評価 |
|------------|---------------------|-----------|------|
| `design_robustness` | DESIGN-004 (Low), DESIGN-005 (Medium) | Medium | B |
| `design_consistency` | DESIGN-001 (Medium), DESIGN-003 (Medium) | Medium | B |
| `modularity` | DESIGN-002 (Low), DESIGN-006 (Low) | Low | B |
| `code_quality` | CODEQ-001〜006 (すべて Low) | Low | B |
| `code_vulnerability` | VULN-001 (Medium), VULN-002/006/007/008 (Low) | Medium | B |
| `cicd_supply_chain` | VULN-003 (Medium), VULN-004 (Low), VULN-005 (Medium) | Medium | B |
| `test_coverage` | QUALITY-001 (**High**) | High | C |
| `license` | QUALITY-006 (Low) | Low | B |
| `documentation` | QUALITY-002 (Medium), QUALITY-003 (Low), QUALITY-004 (Medium), QUALITY-005 (Low) | Medium | B |
| `llm_security` | (指摘なし、LLM 機能自体が無いため評価不能) | — | 対象外 |
| `ai_code_acceptance` | AI-002 (Medium) | Medium | B |

### 重み付けスコア計算

評価を付けた観点 (対象外の `llm_security` を除外) は 10 観点。A=4 / B=3 / C=2 / D=1 として平均する。

- 内訳: A **0** 件 / B **9** 件 (design_robustness, design_consistency, modularity, code_quality,
  code_vulnerability, cicd_supply_chain, license, documentation, ai_code_acceptance) / C **1** 件
  (test_coverage) / D **0** 件
- 計算: `(0×4 + 9×3 + 1×2 + 0×1) / 10 = (27 + 2) / 10 = 2.9`
- 四捨五入: `2.9 → 3` → **B**

**重み付けスコア: B (10 観点中 A 0 / B 9 / C 1 / D 0 → 平均 2.9 → B)**

---

## カバレッジ

### 読んだ範囲 (全文読了)

- ルート: `README.md`, `REVIEW.md`, `HARNESS.md`, `FORMAT_SPEC.md`, `RULE_CODE.md`, `RULE_TEST.md`, `LICENSE`
- `common/`: `REVIEW_DESIGN.md`, `REVIEW_CODE_QUALITY.md`, `REVIEW_VULNERABILITY.md`, `REVIEW_QUALITY.md`,
  `REVIEW_AI.md`, `REVIEW_MISSING_FEATURES.md` (フォーマット正本として Phase 0 で全文読了)
- `scripts/`: `env-leak-checker.mjs`, `repo-status.mjs`, `ludiars-pr.mjs`, `utf8bom.mjs`,
  `check-latest-json.mjs`, `check-migrations.mjs`, `check-personal-data.mjs`, `check-spec-structure.mjs`,
  `infisical-setup.mjs`, `scaffold-spec.mjs`, `harness-check.mjs`, `HARNESS_CHECKS.md`,
  `scores-keys.json`, `env-leak-keywords.json` (14 ファイル全数)
- `.github/workflows/harness.yml`, `.github/workflows/harness-checks.yml`
- `sync.sh`, `sync-local.sh`
- `web/REVIEW.md`, `game/REVIEW.md`, `local-app/REVIEW.md` (総合評価表の観点順序を `scores-keys.json` と
  突合するため。各スタイル固有の `REVIEW_*_WEB.md` 等サブドキュメントは全文読了していない — 下記「未確認」参照)
- `script_design/CODE_HYGIENE.md` (RULE_CODE §15 ログ規約の適用範囲確認のため)
- 前回成果物 `review/2026-05-13/` 一式 (`REVIEW.md`, `REVIEW_DESIGN.md`, `REVIEW_VULNERABILITY.md`,
  `REVIEW_IMPLEMENTATION.md`, `REVIEW_QUALITY.md`, `REVIEW_MISSING_FEATURES.md`, `AUTOFIX.md`, `latest.json`)

### 走査した範囲 (grep / ls-files ベースの機械確認)

- `git ls-files` によるリポジトリ全ファイル一覧の確認 (テストファイル 0 件、`package.json` 0 件、
  `.gitignore` 0 件、`CONTRIBUTING.md`/`CHANGELOG.md` 0 件、`spec/` 0 件を確認)
- `grep -rn "6 分類\|7 分類"` によるドキュメントドリフト箇所の全数確認
- `grep -rn "permissions:\|uses:\|pull_request_target\|secrets\."` によるワークフロー設定の確認
- `grep -rn "E:/\|C:\\\\|/home/\|/Users/"` によるハードコードパスの確認
- `grep -n "Vestigium"` による共有ロガー適用範囲の確認

### 未確認の範囲 (理由付き)

- `RULE.md` (17KB), `RULE_SRE.md`, `RULE_TECH_STACK.md` (Windows 関連のみ grep 確認), `RULE_DATA_SCHEMA.md`,
  `FORMAT_AUTH.md` (17KB) — 全文は読了していない。これらは「AIFormat が配布する規約文書の内容そのもの」
  であり、common-only スタイルの評価観点 (設計/コード品質/脆弱性/テスト/ライセンス/ドキュメント/AI) は
  AIFormat 自身の実装 (`scripts/`, `sync*.sh`, CI) に対して適用するのが本レビューの主眼と判断し、
  規約文書本体の内容妥当性 (規約として正しいか) までは踏み込んでいない。ただし `FORMAT_SPEC.md` との
  整合性 (「6 分類」ドリフト) は横断 grep で確認済み (QUALITY-004)
- `web/REVIEW_VULNERABILITY_WEB.md` 等、web/local-app/game 配下のスタイル固有サブドキュメント (11 ファイル) —
  全文読了せず。AIFormat 自身は web/local-app/game のいずれにも該当しないため、これらのドキュメントの
  「内容」を AIFormat の実装に適用する場面が無く、`web/REVIEW.md` 等のインデックスファイルで
  `scores-keys.json` との観点順序整合のみ確認した
- `.claude/skills/*.md` (9 ファイル), `.claude/commands/*.md` (3 ファイル) — 行数・ハードコードパスの
  grep 確認のみ行い、全文の内容レビュー (プロンプト設計としての品質) は実施していない
- `prompt/README.md`, `prompt/REVIEW_PR.md`, `prompt/SPEC_GAP.md`, `script_design/README.md`,
  `script_design/CI_SECURITY.md`, `script_design/DEP_AUDIT.md`, `script_design/LICENSE_COMPLIANCE.md`,
  `script_design/SECRET_HISTORY.md`, `script_design/SPEC_GAPS.md` — 全文読了せず (ファイル名と目的から
  スコープ外と判断。いずれも「将来の Anatomia 計装設計」であり、現時点で実装コードが伴わない設計文書)
- CI ワークフローの実行ログ (実際に GitHub Actions 上で green/red か) — このセッションはローカル
  working tree のみへのアクセスであり、GitHub 上の実行結果は確認していない。ワークフロー定義ファイルの
  静的な内容 (ステップ構成・permissions 有無) のみを事実として確認した
- `scripts/env-leak-keywords.json:3` の `"<local-user>"` が実在の個人名かどうか — リポジトリ内の記述からは
  断定できず「未確認」として VULN-008 に付記した (指摘の重大度は Low・未確認注記付きに留めた)

**未確認キャップの適用**: 上記のうち `llm_security` を除く全観点は 1 件以上の確定指摘があるため
未確認キャップ (A の上限) は実質的に発動しないが、`documentation` 観点の `spec/` 関連 (QUALITY-002) は
「該当性の判断を伴う充実度評価」の性質上、AIFormat 自身にとって `data/`/`feature/` 等が必要かどうかの
判断に幅があることを明記しておく (指摘は「無いことは事実」の範囲に留め、「あるべき分量」までは断定しない)。

---

## 前回レビュー (2026-05-13) との突合

前回成果物 `review/2026-05-13/` は旧観点体系（指摘 ID 無し、`REVIEW_IMPLEMENTATION.md` に
コード品質/データスキーマ/SRE が同居する構成）。今回から ID を採番するため、以下は
**内容ベースでの対応関係**であり、ID そのものは今回が初出である。

### 解消 (前回指摘が今回は確認されない)

| 前回の指摘内容 | 今回の確認結果 |
|---------------|---------------|
| `env-leak-checker.mjs:285` CORS `Access-Control-Allow-Origin: *` | **解消**。`env-leak-checker.mjs:283-286` にコメント付きで撤去済みを確認 (CWE-942/306 を明記した意図的な修正) |
| `env-leak-checker.mjs:368` バインドアドレス未指定 (`0.0.0.0` の可能性) | **解消**。`env-leak-checker.mjs:366` で `server.listen(port, "127.0.0.1", ...)` に明示済み |
| `README.md:1` が `# AIFormat` 1 行のみ | **解消**。37 行の構造化された索引に改善済み (ただし新たに QUALITY-003/QUALITY-006 の狭い指摘が残る = 部分残存) |

### 継続 (前回指摘と同一事象が今回も存在。今回付番した ID)

| 前回の指摘内容 | 今回の ID |
|---------------|-----------|
| `env-leak-checker.mjs:30` 未使用 import `resolve` | CODEQ-001 |
| `env-leak-checker.mjs:224` デッドコード (二重フィルタ) | CODEQ-002 |
| `repo-status.mjs:30-32` 例外握りつぶし | CODEQ-003 |
| `env-leak-checker.mjs:402` マジックポート `7700` | CODEQ-004 |
| `env-leak-checker.mjs:138` 二重 lower 化 | CODEQ-005 |
| `utf8bom.mjs:166` `✓` 絵文字直書き | CODEQ-006 |
| `sync.sh:1`/`sync-local.sh:1` bash 専用 (Windows 非対応) | DESIGN-001 |
| `sync.sh:54-72`/`sync-local.sh:64-83` ロジック重複 | DESIGN-002 |
| `env-leak-checker.mjs:32` 等 個人パスハードコード | DESIGN-003 |
| `env-leak-checker.mjs` HTTP server タイムアウト無し | DESIGN-004 |
| `sync.sh` の CLAUDE.md 書き換えにバックアップ無し (旧 SRE「障害復旧」) | DESIGN-005 |
| `ludiars-pr.mjs`/`repo-status.mjs` のコマンドインジェクション余地 | VULN-007 |
| `env-leak-keywords.json:3` 個人名 `<local-user>` | VULN-008 |
| `env-leak-checker.mjs:303` `body.keyword` 型検証不足 | VULN-002 |
| テストカバレッジ皆無 (unit/integration/E2E/境界値/CI自動実行) | QUALITY-001 |
| `AI 生成コードの取り込み方針が明文化されているか` (旧ライセンス項目の未チェック) | QUALITY-005 関連 (方針自体は HARNESS.md で確認できたため、今回は `CONTRIBUTING.md` 不在の観点として再整理) |
| 機能改善提案 (sync embed 拡張 / utf8bom --check / repo-status --remote / ludiars-pr --mine,--stale / scan コンテキスト行) | `REVIEW_MISSING_FEATURES.md` に全件継続として再掲 |
| 不足機能提案 (CI / テスト / package.json / .gitignore / Windows sync / 認証 / Schema定義 / new-reviewスクリプト) | `REVIEW_MISSING_FEATURES.md` に全件継続として再掲 (CI ワークフロー自体は新設されたため「部分解消」、詳細は下記) |

### 部分解消

| 前回の指摘内容 | 今回の状態 |
|---------------|-----------|
| CI ワークフロー (`.github/workflows/`) が存在しない | **部分解消**。`harness.yml`/`harness-checks.yml` が新設され `harness-check.mjs` (migrations/personal-data/spec-structure/latest-json チェック) が毎 push/PR で走るようになった。ただし lint/typecheck/test は依然実行されない (QUALITY-001 として継続) |

### 再発 (前回「解消」だったが今回また検出)

該当なし。

### 誤指摘の訂正 (前回の指摘が技術的に成立しないと判明)

| 前回の指摘内容 | 訂正内容 |
|---------------|---------|
| `utf8bom.mjs:96-113`「`delayMs *= 2` が関数引数のデフォルト `1000` に副作用として混入する」 | **誤指摘と判断**。JavaScript の関数引数はデフォルト値を含めて呼び出しごとに新しいローカル束縛が作られるため、`delayMs *= 2` はその呼び出しの再帰内でのみ効果を持ち、次回呼び出し時のデフォルト値には影響しない。現在のコード (`utf8bom.mjs:98-113`) を読んでも越境的な副作用は確認できず、今回は指摘として起票しない |

### 観点体系の変更により対象外化 (指摘の解消ではなく、評価軸自体が無くなったもの)

前回は `REVIEW_IMPLEMENTATION.md`/`REVIEW_QUALITY.md`/`REVIEW_VULNERABILITY.md` に
データスキーマ・SRE・ゼロトラスト・セキュリティ強度・パフォーマンス・クロスプラットフォームの
評価軸があったが、`scripts/scores-keys.json` の `common-only` キー列 (format_version 2) には
これらが含まれない。該当した個々の事実のうち実体が残っているものは、可能な範囲で本レビューの
別観点 (VULN-001 の CSRF 等) に引き継いだ。

| 前回の評価軸 | 前回評価 | 今回の扱い |
|-------------|---------|-----------|
| データスキーマ | A | 対象外化 (common-only に `data_schema` キー無し) |
| SRE | C | 対象外化。「障害復旧 (sync.sh バックアップ無し)」の実体は DESIGN-005 に引継ぎ |
| ゼロトラスト | B | 対象外化 (common-only に `zero_trust` キー無し) |
| セキュリティ強度 | C | 対象外化。「認証なし HTTP API」の実体は VULN-001 (CSRF) に引継ぎ |
| パフォーマンス・ベンチマーク | C | 対象外化 (common-only に `performance` キー無し) |
| クロスプラットフォーム互換 | C | 対象外化。「sync.sh bash専用」の実体は DESIGN-001 に引継ぎ |

### 新規 (前回は評価対象外だった観点で今回新たに検出)

`common/REVIEW_AI.md` (AI 生成コードの検収) は前回の観点体系に存在しなかったため、AI-002 は
純粋新規。CI/CD・サプライチェーンの `permissions`/action ピン留め (VULN-003, VULN-004)、
`spec/` 未整備 (QUALITY-002)、「6 分類」ドキュメントドリフト (QUALITY-004)、
keyword ファイルの同時書込みレース (VULN-006) も前回は明示的に検出されていなかった新規指摘。

### 突合サマリ件数

- 解消: 3 件 (CORS, バインドアドレス, README 空虚)
- 部分解消: 1 件 (CI ワークフロー新設、テスト実行は継続課題)
- 継続: 16 件 (ID 付番済み、上表参照)
- 再発: 0 件
- 誤指摘の訂正: 1 件
- 観点体系変更による対象外化: 6 観点
- 新規: 8 件 (VULN-001 [具体化], VULN-003, VULN-004, VULN-005, VULN-006, AI-002, QUALITY-002, QUALITY-004)
