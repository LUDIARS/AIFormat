---
type: feature
title: 履歴移行の Revisor 公開引き継ぎ
id: AF-RESET-HANDOFF
service: aiformat
domain: repository-reset
status: draft
---

# 履歴移行の Revisor 公開引き継ぎ

旧公開リポジトリを非公開アーカイブにし、同名の新公開リポジトリへ書き換え済み履歴を置く。
2026-09-16 の Pictor 移行で成功した公開経路は、Cc の本人承認を経る Revisor の
`push --handoff`。通常の Git push、GitHub App の直接操作、hook の解除に置き換えない。

## 所有者と不変条件

- AF-RH-01: AIFormat は履歴 bundle・引き継ぎ文書・移行後の照合を所有する。Cc は本人承認、Revisor は公開と一回性台帳を所有する。
- AF-RH-02: manifest/state/bundle/語ファイル/監査結果/handoff は対象 repo と公開用 checkout の外に保存。語・本文・認証情報はログや共有資料に出さない。
- AF-RH-03: 改名後も同じ GitHub repository ID の旧 repo が非公開・アーカイブであり、新 repo は記録した別 ID。URL/name だけで同一性を判断しない。
- AF-RH-04: 新しい repo の ref は空から main 一つだけを作る。handoff の oldSha は40桁のゼロ。非ゼロの履歴置換やタグ移行はこの補助ツールの対象外。
- AF-RH-05: handoff は UUID 付き・排他的作成。既存ファイルを上書きしない。作成も過去の WARNING も公開許可にはならない。
- AF-RH-06: verify は GitHub の ID・visibility・archive・唯一の main SHA・PR/Issue 0件を読み取り照合する。`--apply` 時だけ移行完了を state に記録する。ローカル checkout を書き換えない。

## 実行前

人間が選んだ範囲を確認する。main だけの置換では他 branch/tag/PR参照・PR本文・Issue は消えない。
アーカイブ移行では旧 PR/Issue/Release は旧 repo 側に残る。Release を新 repo へ移すかは別の明示範囲。
非公開アーカイブは、過去に取得された clone/fork/cache の消去を保証しない。

1. 全 PR/Issue のタイトル・本文、issue comments、review comments/reviews を pagination 込みで検査。対象語は外部語ファイルから読み、レポートには件数・番号のみ。画像や添付内の内容まで検査済みとはしない。
2. 旧 repo の ID と公開 main SHA、clean branch がある場合はその SHA を記録し、bundle/state と一致を確認。公開 main が準備元から進んだら止める。
3. Revisor の実 catalog から endpoint を解決し、対象 repo の open/running/queued の審査を確認。移行中の別セッションの push を調整する。
4. Cc は実際の対象 checkout に `lictor cli implement begin --cwd <target> --task "[code] ..."` で bind。task set だけで repo binding が変わったとは考えず、repo_path/repo_origin/branch を読み戻す。

## 準備（公開操作なし）

本体の未追跡ファイルを消さず、準備元 SHA の clean な source worktree を使う。
既存 bundle を使う場合は再作成しない。

```powershell
node <AIFormat>/scripts/github-repository-reset.mjs prepare `
  --manifest <external-manifest.json> --repository <owner/name> `
  --keywords-file <external-keywords.json> --state <external-state.json> `
  --bundle-only --apply
```

コミット数・親子関係を保った履歴をローカル bundle に保存する。state の sourceHistoryTip を
公開 main と直前に照合する。旧 state にこの欄がない場合は、実施記録から元 SHA を確認する。
bundle-only は公開 branch を作らない。Cc session の旧 `migrate/resume` は副作用前に拒否する。

## 改名・新規作成・非公開化

GitHub に書き込む前に対象 owner/name・archive名・元ID/SHA・visibility・引き継がない資産を具体化し、人間の同範囲の実行指示を確認する。
既に指示済みなら重ねて相談へ戻さない。以下は自動再送せず、各 API の結果を記録して進む。

1. archive 名が未使用であることと旧 repo ID/SHA を再確認する。404以外の取得エラーを「未使用」としない。
2. `gh api --method PATCH repos/<owner/name> -f name=<archive-name>` で旧 repo を改名。返された ID が旧 ID のままであることを確認。
3. `gh api --method POST orgs/<owner>/repos -f name=<original-name> -f visibility=public` で空の置換 repo を作成。旧と異なる ID を記録する。説明文等をコピーするなら先に対象語の検査を通す。
4. 旧 repo を `gh api --method PATCH repos/<owner/archive-name> -f visibility=private`、続けて `-F archived=true` とする。公開 push を待って旧データを公開し続けない。

どこかで応答が失われたら、両名前の GitHub ID・visibility・archive・refs を読み取り照合する。
途中状態で `migrate` をやり直さない。改名だけ成功しているなら、元 URL が旧 repo に redirect していないか ID で判断する。
手動復旧は未完了と確定した操作だけ。既存 repo を削除して最初からやり直さない。

## 引き継ぎ文書

公開に使う通常の checkout は manifest の source と同じ Git object database を持つ必要がある。
prepared SHA が未到達なら、検証済み bundle を `git fetch <bundle> refs/heads/cleaned` で取り込む。
fetch は現在 branch を移動しない。detached/bare から公開しない。

```powershell
node <AIFormat>/scripts/github-repository-reset.mjs handoff `
  --manifest <external-manifest.json> --repository <owner/name> `
  --state <external-state.json> --publication-cwd <registered-checkout-root> `
  --replacement-id <new-GitHub-repository-ID> --handoff <new-external-handoff.json> `
  --reason "Approved archive/recreate migration; create main from verified bundle" --apply
```

この操作はローカル文書を作るだけ。新 repo が既に空でなければ拒否し、未知結果の公開を重ねない。
引き継ぎ内容に承認フラグ・session ID・トークンを入れない。

## Cc 承認と Revisor 公開

対象 checkout に bind してから、LICTOR_PORT の sidecar `/v1/concordia/session` で自分の
session ID を都度取得し、メモリ上だけで引き渡す。ログ・ファイルへ保存しない。

```powershell
node <Revisor>/src/cli.mjs push --handoff <external-handoff.json> --session-id <current-session> --json
```

Cc の新しい WARNING カードで本人が「全refを確認し、今回だけ許可」を押す。AIは押さない。
Cc の `push_warning_discord_answer` / decision と、Revisor の `published` は別々に確認する。
Cc で承認されても後続の公開が失敗し得る。JSON出力の detail に session ID が含まれる場合は表示せず除く。
再発行を求められたら古い要求の終了と remote refs を確かめる。古い承認を新しい操作へ転用しない。

Revisor は `--atomic` と ref ごとの lease で App 公開する。Cc/Revisor の実仕様はそれぞれ
`Concordia/spec/feature/danger-command-approval.md`、`Revisor/spec/feature/approved-push-handoff.md`。

失敗/結果不明の場合は同じ handoff と現在の同じセッションで `--reconcile --json` を使う。
これは remote refs の読み取り照合のみで、再公開しない。新しい試行には原因解消、未公開確認、新UUIDと新承認が必要。
同じIDを書き換えず、台帳DBを直接修正しない。セッションが失われた場合も新IDで自動再試行せず台帳とremoteを照合する。

## 完了照合

```powershell
node <AIFormat>/scripts/github-repository-reset.mjs verify `
  --manifest <external-manifest.json> --repository <owner/name> `
  --state <external-state.json> --replacement-id <new-GitHub-repository-ID> `
  --handoff <external-handoff.json> --apply
```

verify の成功は remote の検証結果であり、Revisor の台帳確認を代替しない。Revisor の結果不明は
先に reconcile する。verify で migrated を保存後も、ローカル branch/worktree/tag は旧履歴のまま。
別途 backup と同期計画を立てるまで旧 main を新 repo に merge/push しない。ローカル未追跡・他作業を reset/clean で消さない。

## 実装と検証範囲

CLI: `scripts/github-repository-reset.mjs`。引き継ぎ文書: `scripts/repository-reset/publication-handoff.mjs`。
remote identity/ref 判定: `scripts/repository-reset/migration-observation.mjs`。bundle-only: `git-snapshot.mjs`。
既存の非session向け migrate/resume を残すが、この運用では使わない。ツール自体は Cc の承認を作らずサービスも再起動しない。

テスト5本のAugur登録と解析所見の根拠は
[履歴移行の台帳と解析所見](../test/repository-reset-validation.md) (AF-RESET-VALIDATION) を参照。
台帳への登録は実行成功の証拠ではなく、Revisorの実行結果で別途確認する。
