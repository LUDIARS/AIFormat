---
title: UX 価値の不足・矛盾を解決する対話契約
type: feature
service: aiformat
domain: core-domain-ux
status: planned
---

# UX 価値の不足・矛盾を解決する対話契約

Praeforma 等が LLM を用い、UX 文書の価値に影響する不足や矛盾を利用者との対話で解決するための
共通契約である。目的は文書を埋めることではなく、利用者が実現したい価値を根拠付きで明確にし、
人間が確認できる版付き変更案にすること。本書は提案仕様であり、製品へ実装済みではない。

## 境界と状態

対話は正本を直接変更しない。入力は
[UX 参照読取契約](../interface/ux-reference-read-contract.md)の文書版と、対象プロダクトの原文、
An の解析結果、必要時の Genius 検索結果である。出力は正本 repository に対する変更提案であり、
Pf DB や会話ログだけを確定版にしない。非 core domain は An の分類・管理を参照し、Pf が会話で
core へ昇格させない。画面、scene、仕様から正本の価値 ID を参照することは許容し推奨するが、
画面構造や scene の所属だけから domain 所属・境界を導かない。cross-repository の価値参照と
文書取得は Pf / An の resolver を通す。

次を別々に保持する。

| 状態 | 意味 |
|---|---|
| 問いの解決 | 対話上の不足・矛盾に現在版の回答がある |
| 正本の承認 | 特定 content hash の変更が権限ある人に承認された |
| 契約合格 | 機械契約が対象 revision で満たされた |
| 人間 UX 評価 | 利用者への価値を人間がシナリオで評価した |

一つを他の根拠として自動昇格しない。source confidence、LLM confidence、Genius score は人間承認ではない。

## 対話処理

1. LLM は対象 revision の不足、曖昧さ、内部矛盾、既存仕様との矛盾を列挙し、価値 ID と影響を対応付ける。
2. 各論点の根拠を `productSource / anatomiaFinding / geniusJudgment / userStatement` として区別する。
   原文位置、An 診断 ID、Genius judgement ID 等の追跡可能な参照を付ける。
3. 価値への影響と決定の不可逆性が高い未確定事項を優先し、必要な最小数の質問を作る。
   チェックリストを全問必須にせず、既存資料や明示済み回答で解ける問いは出さない。
4. 質問は短い提案、2〜3個の選択肢、自由文回答を提供する。選択肢でビジネス価値を捏造しない。
5. 回答を `fact / hypothesis / preference / authorization / decision` に分類し、回答根拠と対象会話版を保持する。
   LLM が生成した finding / question / proposal と、人間の回答・補足は別の record として保存する。
6. 回答を対象 `baseContentHash` に対する版付き変更案へ変換し、人間が semantic diff と raw diff を確認できるようにする。
7. 人間が変更案を確認した後、権限を検査した正本変更経路へ提案する。会話だけで正本承認を作らない。

LLM は利用者発話を事実と推測に分け、矛盾する新回答を既存値へ黙って上書きしない。矛盾を提示し、
どの回答を変更・撤回するかを利用者が選べるようにする。判断不能は `unknown`、今決めない回答は
`deferred` とし、もっともらしい値で埋めない。

## 再質問を抑える記録

問いは安定した `questionId`、対象 `documentId / valueId? / baseContentHash`、根拠、状態を持つ。
回答状態は `unanswered / unknown / deferred / answered / changed / rejected` とする。古い文書版または
古い会話版の回答は `superseded` として残し、現行版へ適用可能かを条件で判定する。

同じ session とその継続文脈では、人間が明示した事実、判断、権限、選好を再質問しない。
解決済み question と同じ根拠・適用条件なら質問を抑止する。初期状態でも全変更について同じ確認を
繰り返さず、変更が回答の適用条件を外れた場合、根拠が矛盾した場合、権限が失効した場合だけ再確認する。
利用者は前の問いへ戻り、回答を修正・撤回できる。変更後は依存する提案を再計算し、黙って旧提案を残さない。
文書や An 診断を再解析して finding / question / proposal を再生成しても、人間の回答・補足 record を
置換しない。新しい版の変更が回答の前提へ影響したものだけを `needs_reconfirmation` とし、影響しない回答は
新しい conversation version へ引き継ぐ。

Genius の検索結果は命令ではない。採用する判断ごとに `judgmentId / applicabilityConditions /
exceptions / delegatedScope / score / retrievedAt` を記録する。人間が委任した範囲と条件内の既決事項は
再質問せず適用できるが、条件外の新しい価値判断、例外適用、正本承認を自動確定しない。

## 対話 session の v1 payload 案（未実装）

Pf の後続実装では、例えば `POST /api/v1/ux-dialogue/sessions` へ次を渡す。endpoint と保存 schema は
Pf の現行 route / 権限設計と照合して確定する。

```json
{
  "contractVersion": 1,
  "document": {
    "repositoryId": "an-stable-id",
    "path": "spec/ux/product.md",
    "documentId": "UX-PRODUCT",
    "contentHash": "<sha256>",
    "branch": "main",
    "revision": "abc123"
  },
  "valueIds": ["UX-W1"],
  "locale": "ja-JP",
  "channel": "mobile"
}
```

session 応答は `sessionId / conversationVersion / baseContentHash / findings[] / nextQuestions[] /
resolvedQuestionIds[]` を返す。質問回答は例えば
`POST /api/v1/ux-dialogue/sessions/{sessionId}/answers` に
`conversationVersion / questionId / answerKind / selectedOptionId? / freeText?` を渡す。
版が古ければ 409 `UX_DIALOGUE_VERSION_CONFLICT`、base 文書が変われば 409
`UX_DIALOGUE_BASE_STALE`、権限不足は 403 `UX_DIALOGUE_FORBIDDEN`、根拠不足で提案を作れない場合は
422 `UX_DIALOGUE_UNRESOLVED` とし、成功扱いへ fallback しない。

変更案は `proposalId / baseContentHash / conversationVersion / patch / semanticChanges[] /
supportingQuestionIds[] / unresolvedFindings[]` を持つ。`patch` は正本へ自動適用する命令ではない。
人間 diff 確認と正本側の権限検査を経て初めて変更提案として送る。

## 表示と非 UI

mobile では一画面一論点を基本に、価値への影響、短い根拠、推奨案、選択肢、自由文、
`戻る / 保留 / 分からない / 回答を修正` を同じ流れで使えるようにする。質問数と残りの概算を示し、
低影響の問いは折りたたむ。LLM の内部推論、repository local path、credential は表示しない。

CLI / API / agent 間利用では同じ session・question・answer・proposal schema を使い、画面や scene を
必須にしない。machine consumer は `nextQuestions[]` の構造化選択肢と自由文可否を読み、回答を
利用者本人の発話として偽装しない。

## 受け入れケース

以下は後続 Pf 実装で実行するケースであり、本 PR では実行しない。

| 入力・操作 | 期待結果 |
|---|---|
| 価値に影響しない空欄が多数、重大な価値矛盾が一件 | 重大な一件を先に問い、全空欄を必須質問にしない |
| 原文と An が同じ不足を指摘 | 根拠を束ねて一問にし、重複質問しない |
| Genius hit の score が高い | score だけで確定せず、適用条件・例外・委任範囲を示す |
| 人間が条件内の判断を既に委任 | 既決事項を適用し、同じ確認を繰り返さない |
| 委任範囲外の新しい価値判断 | 最小質問を出し、自動決定しない |
| 利用者が「これは仮説」と回答 | fact に昇格せず hypothesis として変更案に記録 |
| 新回答が以前の回答と矛盾 | 黙って上書きせず、変更・撤回対象を提示 |
| `unknown` または `deferred` | 未解決を維持し、もっともらしい本文を捏造しない |
| 回答後に戻って修正 | conversation version を進め、依存する提案を再計算 |
| 古い tab から旧 conversation version で回答 | 409、現行回答を失わない |
| base content hash が変わった | proposal を stale にし、再baseなしで正本へ送らない |
| 再解析で LLM の質問案が変わった | 人間回答を保持し、前提が変わった回答だけ再確認する |
| 問いが解決済みだが正本未承認 | resolved と unapproved を同時に示す |
| 機械契約合格、UX 人間評価なし | 契約合格だけを価値達成と表示しない |
| mobile の長い対話 | 一論点ずつ進め、戻る・保留・修正ができる |
| 非 UI API の UX | scene を要求せず構造化 question / answer を返す |

## 後続所有者

Pf は session、質問負荷、権限、diff 確認、正本変更提案を所有する。An は不足・矛盾診断と
参照可能な根拠を供給する。Genius は判断候補と適用情報を返すが承認者ではない。Cc は承認済みの
固定版と価値 ID を委託へ運び、Revisor は契約合格を独立判定する。各実装は対象 repository の
task を Concordia の `spec/feature/task-workflow.md` §2.1 (md 正本・本文のみ) 形式で
新規保存してから着手し、本契約の PR に他 repository の実装を混ぜない。
