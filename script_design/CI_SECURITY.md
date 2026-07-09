# CI_SECURITY — CI/CD・サプライチェーン検査 (check-ci-security.mjs)

| 項目 | 値 |
|------|-----|
| 区分 | **CI ゲート** (harness-check に組み込み) |
| 対応レビュー観点 | [`common/REVIEW_VULNERABILITY.md`](../common/REVIEW_VULNERABILITY.md) §2 CI/CD・サプライチェーン |
| 状態 | 設計 (実装は Anatomia 側) |

## 目的

CI 設定・依存管理のサプライチェーンリスクのうち、**設定ファイルだけから決定的に
判定できるもの**を毎 PR で落とす。レビュー観点 §2 のチェック項目を機械側へ移す。

## 検知ロジック

対象: `.github/workflows/*.yml`、パッケージマニフェスト、lockfile。

| kind | 判定 | ゲート |
|------|------|--------|
| `MISSING_PERMISSIONS` | workflow / job に `permissions:` の明示が無い (既定の write-all で走る) | ✓ |
| `UNPINNED_ACTION` | `uses:` が同 org (`LUDIARS/`) 以外で、commit SHA (40 hex) 以外の参照 (`@v4` / `@main`) | ✓ |
| `PR_TARGET_CHECKOUT` | `pull_request_target` トリガーのジョブが PR head を checkout している (secrets 窃取パターン) | ✓ |
| `MISSING_LOCKFILE` | マニフェスト (package.json / Cargo.toml 等) があるのに対応 lockfile が無い | ✓ |
| `UNFROZEN_INSTALL` | CI のインストールが凍結モードでない (`npm install` 使用。`npm ci` / `--frozen-lockfile` に非ず) | ✓ |
| `SELF_HOSTED_ON_PR` | fork PR を受けるトリガーで self-hosted runner を使用 | ✓ |

判定はすべて YAML / JSON の構文レベルで確定でき、実行環境に依存しない。

## 出力仕様

共通 IF (README) に従う。`gate: true`。violation ごとに `path` (workflow ファイル) と
`line` を付ける。

## 誤検知と抑制

- `.harness-allow-ci-security.json` — `{ "unpinned": ["actions/checkout"], "files": [...] }`。
  GitHub 公式 action のタグ参照を許すか否かは**方針ファイル側で宣言** (既定は SHA 必須)。
- 同 org action (`LUDIARS/*`) は UNPINNED の対象外 (自組織は信頼境界の内側)。

## スクリプト化しない判断系

- 「secrets のスコープが適切か」「成果物署名 / provenance の要否」 — 配布要件の判断が
  必要なためレビュー領分 (脆弱性(共通) §2 の残項目として LLM が確認)。
- workflow が「意味的に」安全か (スクリプトインジェクション等の内容解析) — SAST /
  レビュー領分。
