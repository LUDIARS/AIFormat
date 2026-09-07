---
task: codex-domain-enforcement-plan
project: AIFormat
kind: 設計相談
created: 2026-09-07
memory_links:
  - spec/tasks/core-domain-ux-contract-sample.md
  - spec/interface/core-domain-ux-consumers.md
  - FORMAT_UX.md
---
# Codex のドメイン制約を実際の強制経路へ落とし込む

## 目的

お願いとしての規約から機械的な制約へ移すため、Codex の編集経路とレビュー経路で保証できる範囲を区別し、導入仕様を作る。

## 完了条件

- 利用中 Codex の実設定・導入済み機能と公式仕様を確認し、apply_patch、シェル経由書込み、MCP 経由の変更に対する制御経路を整理する。
- 編集前拒否と編集後診断の保証を区別し、サービス不通・未登録・解析不能を暗黙の合格にしない扱いを決める。
- UX→ドメイン→仕様→実装の整合をどこで検証し、どの証跡を Revisor が要求するかを示す。規約のみで迂回不可能とは主張しない。
- テスト禁止のセッションでは未検証を維持する。Castra、Concordia、Revisor 等への実装分担と受け入れケースを定義し、所有リポでの別タスク化条件を残す。

## スコープ (編集可ディレクトリ)

HARNESS.md、RULE_CODE.md、spec/interface/、spec/feature/。Castra 共通設定や Codex ユーザー設定への変更は本タスクに含めない。

## 作業条件

着手時に対象リポと実 checkout branch を確認し Cc に登録する。テスト・サンプル実行・サービス起動はユーザーの明示指示なしに行わない。実行が必要な確認は条件と手順を引き継ぐ。進行状態は Concordia の taskflow_task_state に保持し、この task md に書き戻さない。
