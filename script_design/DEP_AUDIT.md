# DEP_AUDIT — 依存 CVE 監査 (dep-audit.mjs)

| 項目 | 値 |
|------|-----|
| 区分 | **Anatomia 計装** (日次実行。PR ゲートにしない) |
| 対応レビュー観点 | [`common/REVIEW_VULNERABILITY.md`](../common/REVIEW_VULNERABILITY.md) §1 依存ライブラリの既知脆弱性 (CVE) |
| 状態 | 設計 (実装は Anatomia 側) |

## 目的

依存の既知 CVE を日次で監査し、結果を Anatomia に蓄積してデイリーレビュー・AUTOFIX に
供給する。**PR ゲートにはしない** — CVE データベースは時間で変化するため、コード変更と
無関係に CI が赤くなる判定は「決定的に落とす」原則に反する (同一コミットで結果が変わる)。
変化の検知は日次側の責務とし、PR 側は lockfile の整合 ([`CI_SECURITY.md`](./CI_SECURITY.md))
だけを守る。

## 検知ロジック

エコシステム標準の監査 (`npm audit --json` / `cargo audit --json` / `pip-audit` 等) を
ラップし、共通 IF に正規化する。

| kind | 判定 |
|------|------|
| `CVE_CRITICAL` / `CVE_HIGH` / `CVE_MODERATE` / `CVE_LOW` | 監査ツールの severity をそのまま写像 |
| `NO_AUDIT_TOOLING` | マニフェストがあるのに監査手段が確立できない (未対応エコシステム) |
| `AUDIT_NOT_IN_CI` | CI workflow に監査ステップが無い (存在確認は決定的なのでここで検知) |

## 出力仕様

共通 IF に従う。`gate: false` (常に exit 0)。
`metrics: { critical, high, moderate, low, fixable }` (`fixable` = パッチ更新のみで
解消できる件数)。Anatomia は前日比 (`new_cves`) を計算し、新規 Critical / High を
デイリーレビューの脆弱性観点へ、`fixable` を AUTOFIX (機械的修正) の候補へ供給する。

## 誤検知と抑制

- `.harness-allow-cves.json` — `{ "GHSA-xxxx": "到達不能 (dev のみ) の理由" }`。
  理由必須。抑制した CVE もレポートには「抑制済み」として残す (無言で消さない)。

## スクリプト化しない判断系

- CVE が実際に到達可能か (影響評価)・メジャーアップを伴う更新の判断 — レビュー / 人間
  (AUTOFIX ポリシーでも依存メジャーアップは自動修正対象外)
- 修正 PR の作成 — AUTOFIX の領分 (本スクリプトは候補の供給まで)
