---
type: test
title: 履歴移行の台帳と解析所見
id: AF-RESET-VALIDATION
service: aiformat
domain: repository-reset
---

# 履歴移行の台帳と解析所見

## 登録と実行を分ける

`.augur/tests.jsonl` は既存テストをファイル単位の command runner として登録する。
`active` は domain bundle の選択対象であることを意味し、テスト成功の記録ではない。
初期 runs/passStreak は0とし、成功実績を作らない。起動・テストの実行許可は別途必要。
テストはいずれも local Git fixture または API/command adapter の代替を用い、本番 GitHub を操作しない。

| 台帳のテスト | 実行内容 | 対応する契約 |
|---|---|---|
| repository-reset: manifest | manifest.test.mjs | repository名・visibility・重複の入力契約 |
| repository-reset: history bundle | git-snapshot.test.mjs | AF-RH-01/02: bundle-only、履歴保持、パス衝突拒否 |
| repository-reset: GitHub lifecycle adapters | github-lifecycle.test.mjs | 改名・再作成・archiveのAPI順序（adapter代替） |
| repository-reset: migration identity | migration-observation.test.mjs | AF-RH-03/04: ID、private/archive、main以外の参照拒否 |
| repository-reset: publication handoff | publication-handoff.test.mjs | AF-RH-04/05/06: create-only、文書上書き拒否、PR/Issue拒否、完了照合 |

全件を business domain `repository-reset` に結び、プログラム層のフォルダ分類にも対応させる。
既存の Revisor 登録 `diff-check` は3つの既存business domainに結び、台帳追加によって
他ドメインの従来の差分検査が消えないように保持する。他ドメインの機能テストを整備したとは主張しない。

静的な台帳照合:

```text
node <Augur>/bin/augur.mjs tests lint --repo <checkout> --json
```

実行する場合は、許可された環境から `tests run --bundle domain:repository-reset` を使う。
手動実行はプロジェクト本体からの運用規則に従い、台帳を導入したworktreeからサービスを起動しない。
Revisorの審査workerによる対象テスト実行とは区別する。

## 2026-09-17 に確認した前回の所見

根拠は AIFormat main `df1424f18bdd` と Revisor #1881 の保存済み解析。

- **台帳未整備**: 前回のCI結果は `diff-check` 1件。Test OK は新規移行テスト5本の実行証拠ではなかった。今回の台帳で実際のテストファイルを選択可能にする。
- **未分類23アンカー**: business domain は repository-reset に割当済みだが、program layer が未宣言だった。`.anatomia/layers.json` でCLIとworkflow moduleを application と宣言する。全repoの層分類完了とはしない。
- **孤立1件**: `pushNewMain` (`scripts/repository-reset/git-snapshot.mjs`)。CLIが `pushMain: pushNewMain` としてlegacy lifecycleへ渡し、lifecycleが引数を呼ぶ。直接呼び出しエッジだけで未使用と判断して削除しない。
- **coupling_delta**: 旧レビューのアンカー `1153ed2085a7be67`、`6978095ad1f9bf7c`、`9f806d1a2a9a6b3c` が閾値超過。履歴移行workflowのGit/GitHub観測・文書生成・完了照合には複数の境界呼び出しがある。所見は保持し、閾値を引き上げたり無関係なリファクタリングで消したりしない。具体的な関数との対応が再現できるまではSRP違反とも解消済みとも断定しない。
- **旧複雑度集計**: `Function snapshots unavailable or invalid`。この移行ツールの複雑度悪化を示す結果ではない。snapshot供給の修正はAnatomia/Revisor側の別範囲。

Praeforma の project一覧に AIFormat の登録は見つからなかったため、登録を作らず repo の
AF-RESET-HANDOFF を正本として照合した。Anatomia の登録 `aiformat` から context を取得した。
plan の `--home` オプションは未対応で取得できなかった。新しい解析の実行結果は、この調査記録から捏造しない。
