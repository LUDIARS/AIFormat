---
task: shared-ux-consumer-adoption
project: AIFormat
kind: 設計相談
created: 2026-09-07
memory_links:
  - spec/tasks/core-domain-ux-contract-sample.md
  - spec/interface/core-domain-ux-consumers.md
  - FORMAT_UX.md
---
# Anatomia と Praeforma の共通 UX 参照を導入可能な契約にする

## 目的

両 consumer が同じプロダクトの問題・勝利条件を同一版から参照できるよう、既存の参照契約を導入手順と受け入れケースへ具体化する。書式の存在だけで自動読取実装済みとは扱わない。

## 完了条件

- repositoryId、path、documentId、contentHash、勝ち ID の流れを、正本→Anatomia→Praeforma→Cc 委託で定義する。
- missing / invalid / draft / stale / unavailable / ready と人間の版別承認の扱いを確定する。
- 同一版、参照切れ、ID 重複、古いキャッシュ、変更後の古い承認、非 UI プロダクトの受け入れケースを具体化する。
- Anatomia の読取・plan 供給、Praeforma の射影・変更提案、Cc への参照伝達を対象リポ別の実装単位に分解し、各リポへの task 保存と claim を次段階の着手条件として明記する。

## スコープ (編集可ディレクトリ)

FORMAT_UX.md、spec/interface/core-domain-ux-consumers.md、spec/feature/、examples/core-domain-task/spec/ux/。他サービスのコードは対象外。

## 作業条件

着手時に対象リポと実 checkout branch を確認し Cc に登録する。テスト・サンプル実行・サービス起動はユーザーの明示指示なしに行わない。実行が必要な確認は条件と手順を引き継ぐ。進行状態は Concordia の taskflow_task_state に保持し、この task md に書き戻さない。
