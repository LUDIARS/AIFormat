# LICENSE_COMPLIANCE — ライセンス遵守検査 (check-licenses.mjs)

| 項目 | 値 |
|------|-----|
| 区分 | **CI ゲート** (方針ファイル併用) |
| 対応レビュー観点 | [`common/REVIEW_QUALITY.md`](../common/REVIEW_QUALITY.md) §2 ライセンス遵守・OSS 帰属表示 |
| 状態 | 設計 (実装は Anatomia 側) |

## 目的

ライセンス遵守のうち、宣言 (方針ファイル) と機械照合で決定的に判定できる部分を
CI ゲート化する。「配布形態に応じた互換性の解釈」は方針ファイルに**先に人間が宣言**し、
スクリプトは宣言との突合だけを行う (スクリプトに法解釈をさせない)。

## 方針ファイル

リポ直下 `.harness-license-policy.json`:

```json
{
  "distribution": "saas | binary | source",
  "allow": ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC"],
  "deny": ["GPL-3.0-only", "AGPL-3.0-only"],
  "exceptions": { "some-gpl-tool": "devDependency のビルド時利用のみ" }
}
```

## 検知ロジック

| kind | 判定 | ゲート |
|------|------|--------|
| `NO_LICENSE_FILE` | リポ直下に `LICENSE` / `LICENSE.md` が無い | ✓ |
| `NO_POLICY` | 依存があるのに `.harness-license-policy.json` が無い | ✓ |
| `DENIED_LICENSE` | 依存ツリーのライセンスが `deny` に一致 (例外宣言なし) | ✓ |
| `UNKNOWN_LICENSE` | 依存のライセンスが `allow` / `deny` のどちらにも無い・SPDX 不明 | ✓ (要トリアージとして) |
| `MISSING_NOTICE` | `distribution` が binary で、バンドル依存があるのに `NOTICE` / `THIRD_PARTY_LICENSES` が無い | ✓ |

依存ライセンスの取得はエコシステム標準 (`license-checker` / `cargo-deny` 等) を
ラップし、出力を共通 IF に正規化する。

## 出力仕様

共通 IF に従う。`gate: true`。`metrics: { deps: 件数, by_license: {SPDX: 件数} }`
(Anatomia が新規依存の出現をトレンドで拾えるように)。

## 誤検知と抑制

- 例外は方針ファイルの `exceptions` に**理由つき**で宣言する (抑制自体がレビュー対象)。
- デュアルライセンス・SPDX 式 (`MIT OR GPL-2.0`) は allow 側が 1 つでも満たせば適合。

## スクリプト化しない判断系

- 方針そのものの妥当性 (この配布形態でこのライセンスを許してよいか) — 人間 / レビュー領分
- フォント・アイコン・アセットの再配布条件、CLA / DCO 運用、AI 生成コードの方針 —
  文書確認が本体のためレビュー領分 (REVIEW_QUALITY §2 の残項目)
