# AUTOFIX — 2026-05-13

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/AIFormat |
| 実行日 | 2026-05-13 |
| 自動修正件数 | 0 |
| PR | null |

## 修正対象なし

本日の自動修正は実施していません (`autofix_count = 0`)。
レビュー本体で抽出した指摘のうち、ソースコード改変を伴うものは安全範囲の判定に拠らず**全件手作業に回しました**。
本リポジトリは LUDIARS 全体の規約ドキュメント基盤であり、誤修正の影響範囲が広いためです。

## 手作業に回した指摘 (autofix 候補としてフラグした項目)

| 分類 | 該当箇所 | 内容 | 委ねた理由 |
|------|---------|------|------------|
| unused_import | `scripts/env-leak-checker.mjs:30` | `resolve` の未使用 import 削除 | scripts ライブラリの行番号が下流レビューと整合する必要があり、 影響範囲は小だが手動確認推奨 |
| dead_code | `scripts/env-leak-checker.mjs:224` | `args.slice(1).filter((a) => a !== "-v")` の二重フィルタ削除 | 既に上位で除去済の冗長コード、 動作影響ゼロだが意図再確認推奨 |
| typo / mojibake | `scripts/utf8bom.mjs:166` | `✓` 絵文字 → ASCII `[OK]` | UTF-8 BOM ツール自身の出力、 既存ログとの一貫性で要オーナー判断 |
| lint | `scripts/repo-status.mjs:30-32`, `ludiars-pr.mjs:34-36`, `env-leak-checker.mjs:131-133` | 例外握りつぶし `catch {}` を verbose 時 stderr 出力に変更 | 振る舞い変化を含むため自動修正対象外 |
| gitignore | `scripts/env-leak-keywords.json:3` | 個人名 `<local-user>` を default keyword JSON から除去 + `.local.json` 派生に分離 | 設定ファイルの構造変更を伴う、 ドキュメント追加と一括で手動対応 |
| toc | `README.md:1` | README が `# AIFormat` 1 行のみ、 ToC / scripts 一覧追加 | 配布物の表向き、 説明文の方針を要協議 |
| cross-platform | `sync.sh:55,72` / `sync-local.sh:64,83` | PowerShell 版追加 (`sync.ps1`) | Windows 主環境ルールとの整合、 新規ファイル追加で auto-fix 対象外 |
| security | `scripts/env-leak-checker.mjs:285,368` | CORS `*` → 同 origin、 `server.listen(port, "127.0.0.1")` 明示 | 動作変更を含む security hardening、 オーナー確認後に PR |

## 次回 autofix で扱う候補 (安全範囲内に格上げ可能)

- `scripts/env-leak-checker.mjs:30` の未使用 import 削除 (純粋なリント)
- `scripts/env-leak-checker.mjs:224` のデッドコード削除 (リント)
- `scripts/utf8bom.mjs:166` の絵文字→ASCII (typo/mojibake)
- `README.md:1` への ToC + 最短起動手順追加 (toc)

これらは挙動を変えない範囲で自動修正可能だが、 リポジトリオーナーの方針確認 (絵文字許容ポリシー等) が未取得のため本日は保留。

## カテゴリ別カウント

| カテゴリ | 件数 |
|---------|------|
| lint | 0 |
| typo | 0 |
| unused_import | 0 |
| dead_code | 0 |
| gitignore | 0 |
| toc | 0 |
| **合計** | **0** |
