---
title: タスク完了の UX
type: feature
ux_definition: 1
id: UX-TASK-COMPLETION
service: task-example
domain: task-completion
ux_scope: core-domain
product_ux: spec/ux/product.md
status: draft
owner: product-owner
---

# 条件を満たす仕事だけを完了にする

## 誰の、どの状況の問題か

依頼者がタスクを受け取る場面で、未達が残ったまま完了に見えると次の仕事を誤って進めてしまう。

## このプロダクトが何を解決するか

[プロダクト UX](product.md) の UX-W1 / UX-W2 に貢献する。
このサンプルでは「受け入れ条件に基づく完了判断」をコアドメインとする。
保存・通知・観測は支援責務で、このドメインから参照しない。

## 何を勝ちとするか

| ID | 利用者に起きる望ましい変化 | 判断方法・条件 | 証拠 | 現状 |
|---|---|---|---|---|
| UX-C1 | 未達を残して次工程へ進まない | 全条件 true の時だけ completed を返す | C-1 / ready, missing, empty シナリオ | 未実行 |
| UX-C2 | 不足条件を特定して修正できる | false の条件 ID を返し、空の条件は明示的に拒否 | C-1 + 理由の人間レビュー | 未実行・未レビュー |

## 主要シナリオと失敗からの回復

- ready: 開いているタスクの条件がすべて満たされる → 完了結果を返す。
- missing: 条件が一つ未達 → open と未達 ID を返す → 条件を満たして再評価する。
- empty: 条件が定義されていない → open と missing-criteria を返す → 依頼者が条件を定義する。

## 守る制約と優先順位

入力オブジェクトを変更しない。条件なしを全件成功と解釈しない。理由にタスク本文を混ぜない。
型/形状の不正は入力エラー。通常の未達は正常な業務結果として返す。

## 対応関係・非目標・未決事項

UX-C1 → INV-1 / INV-2 → C-1 → 三つの実行シナリオ。
UX-C2 → INV-3 → C-1 → 機械出力 + product-owner の説明内容レビュー。
[業務仕様](../feature/task-completion.md)を参照。期限、権限、DB 競合、UX 満足度の判定は対象外。
