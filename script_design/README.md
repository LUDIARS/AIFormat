# script_design/ — 機械解析スクリプトの設計

レビューフォーマットのチェック項目のうち、**機械解析可能な観点(スクリプト化できるもの)**の
設計をまとめる。実装・定期実行・結果の蓄積は機械分析ハブ **Anatomia** に委ねる。
本フォルダは「何を・どう判定し・何を判断系に残すか」の設計正本。

## 3 区分 — どこで守るか

HARNESS の原則「強制できるものは記憶に頼らない」をレビューにも適用し、
チェック項目を 3 区分に振り分ける:

| 区分 | 性質 | 実行 | 失敗の扱い |
|------|------|------|-----------|
| **CI ゲート** | 判断を挟まず決定的に違反と言える | `harness-check.mjs` 経由・毎 PR | exit 1 でマージ阻止 |
| **Anatomia 計装** | 機械で列挙できるが該当性・重大度に判断が残る (シグナル) | Anatomia が定期実行・蓄積・トレンド化 | 落とさない。デイリーレビュー / SPEC_GAP プロンプトへの入力 |
| **レビュー領分** | 設計判断・文脈理解が本体 | LLM レビュー ([`prompt/`](../prompt/)) | 指摘として起票 |

判断基準: **誤検知をゼロにできるか**。できるなら CI ゲート、シグナルまでなら Anatomia 計装、
シグナルすら切り出せないならレビュー領分(スクリプト化しない)。

## Anatomia 連携契約 (共通 IF)

全スクリプトは既存 `scripts/check-*.mjs` と同じ流儀に揃える:

- CLI: `node <script>.mjs [repoDir] [--json]`。repoDir 省略時は cwd。
- exit code: `0` = 問題なし(対象不在もスキップで 0) / `1` = 違反あり。計装系 (report-only) は
  常に `0` で終了し、結果は JSON で返す。
- `--json` 出力スキーマ (Anatomia が蓄積・トレンド化する単位):

```json
{
  "script": "check-xxx",
  "repo": ".",
  "gate": true,
  "violations": [ { "kind": "KIND", "path": "file", "line": 1, "msg": "..." } ],
  "metrics": { "<名前>": 0 }
}
```

- 誤検知の抑制はリポ直下の設定ファイルで行う (`check-personal-data` の
  `.harness-allow-personal-data.json` と同方式)。抑制はレビュー成果物から参照可能にする。

## インベントリ — レビュー観点 × スクリプト

### 実装済み (scripts/)

| スクリプト | 区分 | 対応レビュー観点 |
|-----------|------|----------------|
| `check-migrations.mjs` | CI ゲート | RULE.md §2 (DB マイグレーション) |
| `check-personal-data.mjs` | CI ゲート | RULE.md §5 / Web 個人データ保護 §1 (Cernere 集約) |
| `check-spec-structure.mjs` | CI ゲート | FORMAT_SPEC §1 (spec/ 構造) |
| `check-latest-json.mjs` | CI ゲート | REVIEW.md (latest.json スキーマ) |
| `env-leak-checker.mjs` | 計装 (手動起点) | 環境名・個人名の漏洩 |
| `utf8bom.mjs` | 修正ツール | RULE_CODE §17 (エンコーディング) |

### 設計 (本フォルダ。実装は Anatomia 側)

| 設計 | 区分 | 対応レビュー観点 |
|------|------|----------------|
| [`CI_SECURITY.md`](./CI_SECURITY.md) | CI ゲート | 脆弱性(共通) §2 CI/CD・サプライチェーン |
| [`SECRET_HISTORY.md`](./SECRET_HISTORY.md) | ゲート + 計装の 2 段 | 脆弱性(共通) §1 ハードコードシークレット / §2 履歴スキャン |
| [`SPEC_GAPS.md`](./SPEC_GAPS.md) | Anatomia 計装 | 品質保証(共通) §3 ドキュメント充実度 / [`prompt/SPEC_GAP.md`](../prompt/SPEC_GAP.md) Phase A・B |
| [`CODE_HYGIENE.md`](./CODE_HYGIENE.md) | Anatomia 計装 | コード品質 (RULE_CODE §7/§15/§19/§20 のシグナル) |
| [`LICENSE_COMPLIANCE.md`](./LICENSE_COMPLIANCE.md) | CI ゲート (方針ファイル併用) | 品質保証(共通) §2 ライセンス遵守 |
| [`DEP_AUDIT.md`](./DEP_AUDIT.md) | Anatomia 計装 (日次) | 脆弱性(共通) §1 依存 CVE |

### スクリプト化しない (レビュー領分に残す)

- 設計強度 / 一貫性 / 凝集度、God Class 判定、命名の適切性 — 文脈判断が本体
- マジックナンバーの是非、コメントが why を書いているか — 該当性判断が本体
- 評価 (A〜D) の導出・重大度付け — 指摘の意味理解が前提 (プロンプト側の規律で担保)
- lint / 型検査 / floating promise 等、**既存 linter が担うもの** — 各リポの
  eslint / tsc / clippy に委ね、二重実装しない (CI にあるかは `CI_SECURITY` が確認)

## 設計ドキュメントの書式

各設計は次を必ず含める: **目的 / 区分 / 対応レビュー観点 (トレーサビリティ) /
検知ロジック (violation kind 一覧) / 出力仕様 / 誤検知と抑制 / スクリプト化しない判断系**。
「何を検知しないか」を明記するのは、check-spec-structure が充実度を意図的に
落とさないのと同じ設計判断の明文化。
