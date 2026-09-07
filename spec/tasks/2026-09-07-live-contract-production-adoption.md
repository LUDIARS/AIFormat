---
task: live-contract-production-adoption
project: AIFormat
kind: 設計相談
created: 2026-09-07
memory_links:
  - spec/tasks/core-domain-ux-contract-sample.md
  - spec/interface/core-domain-ux-consumers.md
  - FORMAT_UX.md
---
# 契約観測サンプルから本番実装への導入契約を定義する

## 目的

同期・メモリ内の教材を本番契約ラッパーと同一視せず、Lapilli / Augur / Concordia / Revisor の責務と証跡の信頼境界を定義する。

## 完了条件

- 現行 API と実装を再確認し、ラッパー、注入、集計、完了判定それぞれの責務と未実装箇所を特定する。
- 実装・述語・必須契約ポリシー・UX 版を束ねた revision と run ID を定義し、編集前の成功証跡の再利用を拒否する条件を定める。
- 契約欠落、空述語、未観測、違反、集計不能、不完全な証跡を合格と区別する。証跡生成者と必須契約ポリシーの改変権限を整理する。
- 例外・副作用・非同期処理・計測負荷・機密値の扱いを含む受け入れケースを作り、各サービスの対象リポに保存すべき実装単位と依存順序を示す。

## スコープ (編集可ディレクトリ)

spec/interface/、spec/feature/、RULE_TEST.md、examples/core-domain-task/README.md。本番サービスへの接続実装は各所有リポの別タスクとする。

## 作業条件

着手時に対象リポと実 checkout branch を確認し Cc に登録する。テスト・サンプル実行・サービス起動はユーザーの明示指示なしに行わない。実行が必要な確認は条件と手順を引き継ぐ。進行状態は Concordia の taskflow_task_state に保持し、この task md に書き戻さない。
