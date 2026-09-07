---
task: core-domain-sample-spec-linkage
project: AIFormat
kind: 実装
created: 2026-09-07
memory_links:
  - spec/tasks/core-domain-ux-contract-sample.md
  - spec/interface/core-domain-ux-consumers.md
  - FORMAT_UX.md
---
# 契約サンプルのドメイン分類と仕様紐付けを補完する

## 目的

サンプルでドメイン優先の規約を実証できるよう、Anatomia の未分類・孤立関数・仕様紐付けの原因を解消する。レビュー通知では未分類アンカー32件、孤立関数2件、spec_linkage 未通過が報告された。件数だけから原因や対象関数を推定しない。

## 完了条件

- 保存済みレビュー診断から対象パス・関数と分類根拠を特定する。
- サンプルの実際の責務に沿って domain 定義、layer 設定、specRefs を補完する。無関係なドメインへの一括割当やゲート弱体化は行わない。
- サンプルを独立プロジェクトとして解析する場合と AIFormat 全体の解析境界を文書化する。
- 対象所見が解消された証跡、または解析器側に残る具体的原因と対象リポへの引継ぎを残す。検査未実行を解消済みとしない。

## スコープ (編集可ディレクトリ)

examples/core-domain-task/、spec/domains/、spec/feature/。解析器の実装修正が必要なら Anatomia 側の別タスクへ切り出す。

## 作業条件

着手時に対象リポと実 checkout branch を確認し Cc に登録する。テスト・サンプル実行・サービス起動はユーザーの明示指示なしに行わない。実行が必要な確認は条件と手順を引き継ぐ。進行状態は Concordia の taskflow_task_state に保持し、この task md に書き戻さない。
