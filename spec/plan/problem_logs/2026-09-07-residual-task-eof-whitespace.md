# 残作業タスクの末尾空行で差分チェックが失敗

## 事象と証拠

2026-09-07 04:49 UTC の Revisor 審査で、残作業タスク5件の追加が
登録検査 diff-check の exitCode 2 によりブロックされた。
対象は spec/tasks/2026-09-07- で始まる codex-domain-enforcement-plan、
core-domain-sample-spec-linkage、domain-contract-content-coverage、
live-contract-production-adoption、shared-ux-consumer-adoption の5ファイル。
各31行目の診断は「new blank line at EOF.」だった。

## 原因

ファイル生成時に最終改行の後へ空行を追加した。提出前の差分チェックも同じ問題を
報告していたが、PowerShell の逐次コマンドが非ゼロ終了コードで自動停止せず、
担当セッションも診断を見落として commit した。

## 修正

対象5ファイルの余分な末尾空行だけを除去する。タスク本文・frontmatter・
Concordia の進行状態は変更しない。差分チェックと commit を分け、
チェックの終了コードを確認してから commit する。

## 確認と引継ぎ

提出前に差分と末尾を静的確認する。単体・統合・起動テストは実行しない。
Revisor の登録検査の再審査結果で解消を確認する。
今回の保存済み診断では spec_linkage は通過しており、未分類アンカー32件と
孤立関数2件は別途保存済みの仕様紐付けタスクで扱う。
