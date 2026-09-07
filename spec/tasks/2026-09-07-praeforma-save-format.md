---
task: praeforma-save-format
project: AIFormat
kind: 設計相談
created: 2026-09-07
memory_links:
  - FORMAT_UX.md
  - spec/interface/ux-reference-read-contract.md
  - spec/feature/ux-value-dialogue.md
---
# Praeforma 保存形式の追加合意を設計へ反映する

## 目的と範囲

OKF と JSON の分離、およびアクター／シーンそれぞれの入れ子とパーツ再利用を共通設計として残す。
編集対象は FORMAT_UX.md と spec/interface/praeforma-save-format.md、および本 task。
コード実装、実装管理、別セッションの起動は対象外。

## 完了条件

- 文書と構造の正本の分担、安定 ID、定義とインスタンスの違いを記載する。
- シーン構造からドメイン所属を導かないことを明記する。
- 動的・追従 UI、変換時の欠落、版・承認の扱いと実装時の確認観点を記載する。
- ユーザーが許可した Revisor 標準フローへ設計変更を提出する。

テスト・起動は行わない。具体的 Schema と移行処理は別の実装作業で定義する。
