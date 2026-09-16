---
name: github-history-migration
description: 公開GitHubリポジトリの履歴を作り直す際、PR・Issue漏出確認、旧repoの非公開アーカイブ、同名repo作成、Cc本人承認とRevisor handoffでの公開・復旧を扱う。通常のPRやrelease公開には使わない。
---

# GitHub history migration

まず `${ARS_ROOT}/AIFormat/spec/feature/repository-reset-handoff.md` を読む。
ARS_ROOT 未設定時のこの環境の workspace は `E:/Document/Ars`。ツール正本は同じ AIFormat の
`scripts/github-repository-reset.mjs`。作業済みPictorの名前・ID・SHAを他repoに流用しない。
未マージの変更しかない場合は存在するreview worktreeを確認し、mainに反映済みと扱わない。

## 選択と事前照合

- 人間の目的を確認し、mainのみの差し替えとアーカイブ・再作成を区別する。PR/Issue、他branch/tag、Releaseの扱いを勝手に同一視しない。
- 対象語ファイルはgitignore済み外部stateに置く。全PR/Issue本文・コメント・reviewをpagination込みで調べ、語や本文は出力せず番号・件数で報告。未検査の画像・添付も検査済みにしない。
- 公開mainの元SHAとprepared bundle/state、元repository ID、審査中/待機中PRを照合。mainが進んだら移行を止める。portは現行のサービス所有catalogから解決する。
- 書き込み対象を具体化し、同範囲の人間の実行指示を確認する。会話に指示済みなら再確認しない。CcのWARNING本人操作は別の実行時承認であり、会話から代行しない。

## 成功した経路

1. Cc/Revisor配下では `prepare --bundle-only`。既存bundleは再作成せず照合して使う。
2. 旧repoを改名し、別IDの同名repoを新規作成。旧repoを非公開アーカイブにする。結果ごとにID・状態を保存。途中失敗で `migrate` を再実行しない。
3. 通常の対象checkoutに `lictor cli implement begin --cwd <target> --task "[code] ..."` で正式bind。repo_path/repo_origin/branchを読み戻す。task setだけではbindingが更新されない場合がある。
4. 必要ならbundleからprepared commitをfetchし、`handoff` で新UUIDの外部JSONを生成。新mainのoldShaは40桁ゼロ。チェックアウトをresetしない。
5. `node <Revisor>/src/cli.mjs push --handoff <json> --session-id <current-session> --json` を使う。session IDは自分のLictor sidecarから都度取得し、ログ/ファイル/メモリに残さない。JSON出力のdetailにもsession IDがある場合は表示しない。
6. Ccが配送する最新WARNINGの「全refを確認し、今回だけ許可」を本人が押す。AIは自己承認しない。CcのapprovedとRvのpublishedは別に確かめる。
7. Revisorのpublishedとremote refsを確認し、`verify --apply` で新旧ID・private/archive・main SHA・PR/Issueを照合して完了stateを保存。ローカルの旧branch/worktree同期は別途扱う。

## 結果不明・再発行

- 古い要求が生きているかとremote refsを先に照合し、並行pushを増やさない。
- Rvの結果不明は同じhandoffの `--reconcile --json`。同じIDの再実行は再公開しない。新試行は未公開確認と原因解消後、新UUID・新WARNINGで行う。
- 期限切れや押し損ねをAI承認で埋めない。配送/回答/公開のどこまで成功したかを短く報告する。
- bare repoのCc hook失敗、通常git pushの共通main guard、Revisor direct-main拒否を順に踏まない。最初からRv handoffを使う。`ALLOW_MAIN_PUSH`だけではRv公開を許可できない。
- GitHub AppはRevisorが承認後の公開に使う。Appの別経路利用・hook無効化・台帳編集で承認を代替しない。

正本の承認契約は `${ARS_ROOT}/Concordia/spec/feature/danger-command-approval.md` と
`${ARS_ROOT}/Revisor/spec/feature/approved-push-handoff.md`。本スキルの読み込み自体は移行・push・テスト・再起動の実行指示ではない。
