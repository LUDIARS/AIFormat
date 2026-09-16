---
task: repository-reset-handoff
project: Af
kind: implementation
created: 2026-09-16
memory_links: []
---

# 履歴移行の成功経路をツール・スキル・メモリへ保存

利用者の依頼: Pictorで成功した非公開アーカイブ・同名repo再作成・Cc本人承認・Revisor handoff公開を再利用可能にする。

受入条件:
- Cc配下の準備は公開を伴わないbundle-onlyを使える。
- 新repoのcreate-only main公開用handoffを、元/新ID・外部bundle・checkoutを照合して排他的に生成できる。
- GitHubの新旧repo・main・PR/Issueを照合した後のみ移行完了を記録する。
- skillに承認/配送/公開を区別した手順と、結果不明時のreconcileを残す。
- Pictorのprivate project memoryには日付付きの実施事実と再利用先を残す。語・session ID・tokenは転記しない。

対象仕様: AF-RESET-HANDOFF、AF-RH-01〜06。既存の実移行は完了済み。この変更のために再移行や公開を行わない。
