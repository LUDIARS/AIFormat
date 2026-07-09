# コード品質レビュー（共通） (Code Quality Review — Common)

全スタイル共通。対象リポジトリ・PR 情報を記載し、可読性・保守性の観点でコードを評価する。

> 規約の正本は [`RULE_CODE.md`](../../RULE_CODE.md)。本チェックリストは同規約の遵守を裏側から確認する。

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/AIFormat |
| 対象ブランチ / PR | claude/aiformat-review-audit-7bqy7r (working tree = HEAD) |
| レビュー実施日 | 2026-07-09 |
| 対象コミット範囲 | 086eb42 .. 518fdee |

---

## 1. コード品質 (Code Quality)

可読性・保守性の観点から問題のあるコードを検出する。対象: `scripts/*.mjs` 14 本 (全文読了)、`sync.sh` / `sync-local.sh` (全文読了)。

| 該当箇所 | 問題分類 | 説明 | 推奨修正 |
|----------|---------|------|---------|
| `scripts/env-leak-checker.mjs:27` | 未使用 import | `resolve` を `node:path` から import しているが、実際に呼ばれている `resolve(...)` (`:377,382,384`) は `readBody` 内の `Promise` executor の同名ローカル引数で、import した `path.resolve` は未使用 | `resolve` を import から削除する |
| `scripts/env-leak-checker.mjs:224` | デッドコード | `args.slice(1).filter((a) => a !== "-v")` が `runCli` 内に残るが、`-v`/`--verbose` はエントリポイント (`:568-572`) で既にグローバルに除去済みで、この filter は到達しない | `args.slice(1)` に簡略化する |
| `scripts/repo-status.mjs:23-33`, `scripts/ludiars-pr.mjs:15-26` | 例外の握りつぶし | `git()` / `isLudiarsRepo()` が `catch { return "" / false }` で全エラーを無音化し、理由コメントも `--verbose` 時の代替出力も無い | RULE_CODE §7 に従い、握りつぶす理由をコメントで明示するか `-v` 時に `console.error` へ出す |
| `scripts/env-leak-checker.mjs:576,578` | マジックナンバー | デフォルトポート `7700` が 2 箇所に直書き (JSDoc の `:15` も含めると 3 箇所) で名前付き定数になっていない | `const DEFAULT_PORT = 7700;` を定義して参照する |
| `scripts/env-leak-checker.mjs:138,145` | 軽微な非効率 (二重計算) | `kwLower[i]` で事前計算済みの小文字化キーワードがあるにもかかわらず、`lineKws` 抽出時に `kw.toLowerCase()` を再計算している | `matchingKws` と対になる小文字配列を保持し再計算を避ける |
| `scripts/utf8bom.mjs:166` | 出力の非 ASCII 直書き | 変換成功ログに `✓` (U+2713) を直書き。cmd.exe 等の非 UTF-8 コードページ環境で文字化けの可能性 | `[OK]` 等の ASCII 表記に置き換える |

### チェック項目

- [x] マジックナンバー・マジックストリングが使用されていないか — `7700` の 1 件のみ軽微 (上表)
- [ ] ファイルパス・URL・ポート番号・ホスト名などの環境依存値がソースに直書きされていないか — `BASE_DIR` の個人パス直書き (`common/REVIEW_DESIGN.md` DESIGN-003 で計上、本表では重複起票しない)
- [x] 過度にネストした条件分岐がないか (早期リターンで改善可能か) — 全ファイルで 3 段以上のネストは確認されず
- [ ] 未使用のコード・デッドコードが残存していないか — `env-leak-checker.mjs:27` (未使用 import), `:224` (デッドコード)
- [x] コピー&ペーストによる重複コードがないか (DRY違反) — `sync.sh`/`sync-local.sh` の重複は `common/REVIEW_DESIGN.md` DESIGN-002 (モジュール分割度) で計上
- [x] 変数・関数のスコープが必要以上に広くないか — 各ファイルでモジュールスコープの定数以外はローカルスコープに収まっている
- [ ] 例外の握りつぶし (空の catch ブロック) がないか — `repo-status.mjs:23-33`, `ludiars-pr.mjs:15-26`, `ludiars-pr.mjs:34-37` (`getPRs` は呼び出し側でログ出力するため許容), `env-leak-checker.mjs:129-133`(バイナリ/読取不可のスキップ、理由がコード上自明なため許容), `env-leak-checker.mjs:173-176`(`listRepos` のディレクトリ列挙失敗スキップ、同様に許容)
- [x] 不適切な型変換・暗黙的型変換がないか — 確認範囲内で問題なし
- [x] ログ出力が適切なレベルで記録されているか — `VERBOSE` フラグで `[v]` プレフィックス付き出力を切替、`--json` で機械可読出力に分離
- [x] 命名が役割を正しく表しているか — `shouldIgnoreFile` / `walkDir` / `analyzeRepo` 等、真偽値は `is`/`should` 接頭辞に従う
- [x] 関数・メソッドが過度に長大化していないか — 最長は `env-leak-checker.mjs` の `startServer` (約 90 行) だが単一責務 (HTTP ルーティング) の範囲内
- [ ] クラス / モジュール / 関数が単一責任を守っているか — `env-leak-checker.mjs` 自体の複数責務同居は `common/REVIEW_DESIGN.md` DESIGN-006 (モジュール分割度) で計上
- [ ] 1 ファイル 1 責務になっているか — 同上 (DESIGN-006)
- [x] レイヤー依存方向が一方向か — `scripts/*.mjs` は相互 import が無くレイヤー違反も無い
- [x] 例外の握りつぶしに理由コメントがあるか — 上記の許容 3 件はコードの文脈から自明 (バイナリ判定・ディレクトリ存在確認)。`repo-status.mjs`/`ludiars-pr.mjs` の 2 件のみ理由コメント欠如 (上表)
- [ ] 外部入力をスキーマ検証し、必須前提を入口で検証して fail-fast しているか — `env-leak-checker.mjs` の HTTP API 入力検証不足は `common/REVIEW_VULNERABILITY.md` VULN-001/VULN-002 で計上 (本表では重複起票しない)
- [x] 確保した資源が全経路で解放され、置き換えが回転方式か — 対象スクリプトに永続的な resource handle (socket 常駐は `serve` のみ、プロセス終了で解放) は無く、ファイル I/O は都度 open/close される同期・await 済み API を使用
- [x] floating promise が無いか — `readBody` の `Promise` は `await` されている。`main().catch(...)` (`infisical-setup.mjs:249-252`, `utf8bom.mjs:185` は `main()` 呼び捨てだが単一トップレベル呼び出しでプロセス終了と共に完結するため実害小、`utf8bom.mjs` 側は `.catch` 無しで未処理拒否の可能性が残る — Low 相当だが本レビューでは独立指摘としては起票せず所見に留める)
- [x] プロセス境界/パイプ/ネットワークの I/O で encoding が明示されているか — `execSync` 呼び出しは `encoding: "utf-8"` を明示、`readFileSync` も `"utf-8"` 明示
- [ ] 子プロセス起動が shell 非経由・引数配列か — `repo-status.mjs:25` `ludiars-pr.mjs:18,30` が `execSync` にテンプレートリテラルの文字列コマンドを渡しており shell 経由 (`common/REVIEW_VULNERABILITY.md` VULN-007 で計上)
- [ ] secret / 個人データをソース・ログ・例外に出していないか — `env-leak-keywords.json:3` の `"<local-user>"` (`common/REVIEW_VULNERABILITY.md` VULN-008 で計上)
- [x] ログが共有ロガー (Vestigium) 経由か — `scripts/` 直下の CLI 出力用 console は `script_design/CODE_HYGIENE.md:26` の除外規定により対象外 (明示的に除外対象と規定されていることを確認済み)
- [x] 時刻が UTC/ISO8601 か — `ludiars-pr.mjs:40-48` の `relativeTime` は `Date.now()` と ISO 文字列を比較する相対表示のみで、保存・送信を伴わないため該当性薄いが処理自体に矛盾は無い
- [x] ソース・コメントが UTF-8 か — 確認した全ファイルが UTF-8 (BOM 無し, Node.js ネイティブ実行前提と一致)
- [x] 新規依存が最小限か — 全 `scripts/*.mjs` が `node:*` builtin のみで third-party 依存 0 件 (`git ls-files` に `package.json` 無しで確認済み)
- [x] non-null 断言の濫用が無いか — TypeScript 不使用 (Node.js `.mjs` のみ) のため該当性低いが、暗黙の破壊的変更は確認されず
- [ ] TODO/FIXME が Issue 化されているか — `grep -rn "TODO\|FIXME" scripts/*.mjs sync*.sh` → 0 件 (対象外: TODO/FIXME 自体が存在しないため該当なし)

> データスキーマ / テスト / 運用の観点は `RULE_DATA_SCHEMA.md` / `RULE_TEST.md` / `RULE_SRE.md` と対応するレビュー (`REVIEW_DESIGN` / `REVIEW_QUALITY` / スタイル別) で確認する。common-only スタイルでは `scripts/scores-keys.json` にデータスキーマ / SRE 軸が含まれないため、本リポジトリではこれらは評価対象外 (詳細は [REVIEW.md](REVIEW.md) 参照)。

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | コード品質 | B | 0 |

**評価基準**（重大度の定義・導出ルール・対象外の扱いは [REVIEW.md「評価の決定ルール」](../../REVIEW.md#評価の決定ルール) を正本とする）:
- **A**: 指摘 0 件。チェック項目をすべて満たす
- **B**: Medium / Low の指摘のみ。運用上の影響は低い
- **C**: High の指摘が 1 件以上。リリース前の対応を推奨
- **D**: Critical の指摘が 1 件以上。即時対応が必要

## 指摘一覧 (このドキュメント分)

| ID | 重大度 | 該当箇所 | 概要 |
|----|--------|----------|------|
| CODEQ-001 | Low | `env-leak-checker.mjs:27` | 未使用 import `resolve` |
| CODEQ-002 | Low | `env-leak-checker.mjs:224` | デッドコード (到達不能な `-v` 二重フィルタ) |
| CODEQ-003 | Low | `repo-status.mjs:23-33`, `ludiars-pr.mjs:15-26` | 例外握りつぶし (理由コメント無し) |
| CODEQ-004 | Low | `env-leak-checker.mjs:576,578` | マジックナンバー `7700` 未定数化 |
| CODEQ-005 | Low | `env-leak-checker.mjs:138,145` | 二重 `toLowerCase()` 計算 |
| CODEQ-006 | Low | `utf8bom.mjs:166` | `✓` 絵文字の直書き |
