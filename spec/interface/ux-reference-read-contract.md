---
title: UX 参照読取・版別承認契約
type: interface
service: aiformat
domain: core-domain-ux
status: planned
---

# UX 参照読取・版別承認契約

本書は Anatomia (An) と Praeforma (Pf) が UX 正本を同じ意味で読むための共通契約である。
共通書式は [FORMAT_UX.md](../../FORMAT_UX.md)、consumer の責務は
[core-domain-ux-consumers.md](core-domain-ux-consumers.md)を参照する。本書は提案仕様であり、
An / Pf に API や検査が実装済みであることを示さない。

## 識別と resolver

`documentId` は UX 文書 frontmatter の `id` であり、ファイル名から生成しない。
参照の完全な識別子は次の組である。

| field | 契約 |
|---|---|
| `repositoryId` | An に登録された正規 repository の stable ID |
| `path` | repository root 基準、`/` 区切り、`..` と root 外 symlink を許さない相対パス |
| `documentId` | frontmatter `id`。repository 内で一意 |
| `contentHash` | BOM を含む正本の生 UTF-8 bytes の SHA-256、小文字 hex |
| `branch` | 読取対象 branch。省略時の既定 branch も応答に明示 |
| `revision` | branch 上で実際に読んだ commit ID |

hash 前に改行、BOM、Unicode、末尾空白、frontmatter を正規化しない。文字列へ decode できない
UTF-8 は `invalid` であり、置換文字を入れた派生文字列の hash を正本 hash としない。

An の project registry ID は登録入力や name / URL から導出され、競合時に root path suffix を
含み得る。`id` と `rootPath` は登録後の identity である。したがって An API の任意の
`projectId` を検証なしに `repositoryId` と見なしてはならない。Pf の `anatomiaRepo` resolver は、
正規登録の ID、canonical remote、解決済み root を照合して一つに決める。alias / linked worktree は
同じ正規 repository へ畳める場合だけ許可し、複数登録、異なる remote の同名 repository、
登録 root の食い違いを診断して判定不能にする。private repository の local path や credential を
consumer payload や診断へ露出しない。

## 価値 ID の抽出と参照

価値節は `どの価値を実現するか` と旧見出し `何を勝ちとするか` のどちらも受理する。
その節の Markdown table の先頭列を価値 ID とし、header / separator 行を除いた trim 済み値が
`^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$` に一致しなければ `invalid_value_id` とする。
一文書内の重複は `duplicate_value_id`、参照先に無い ID は `broken_value_reference` である。
同じ ID は別文書に存在できるため、同一 repository 内の参照は `{ documentId, valueId }`、
cross-repository 参照は `{ repositoryId, documentId, valueId }` を用いる。

既存の `UX-W1`、`UX-C1` 等は利用者への価値を指す安定 ID であり、表示呼称や見出しの変更で
改名しない。新規 wire field は `valueIds` とする。移行 adapter は旧 `winIds` を受け取って
同じ意味へ正規化してよい。両 field があり内容が異なる場合は黙って一方を採らず
`conflicting_value_id_fields` とする。これは要求 payload の不整合であり、文書内容の
`readState: invalid` ではない。要求として拒否する (`UX_REQUEST_INVALID`)。

## 独立した三つの状態軸

### 読取状態 `readState`

| 値 | 意味 | 本文閲覧 |
|---|---|---|
| `missing` | 対象 path または文書が存在しない | 不可 |
| `invalid` | UTF-8、frontmatter、ID、参照整合等が不正 | 診断用 raw 表示だけ可 |
| `stale` | cache は読めるが要求 branch / revision の取得結果ではない | stale 明示で可 |
| `unavailable` | 権限、通信、provider 障害等で現行版を取得できず、有効な cache も無い | 不可 |
| `ready` | 対象 branch / revision の bytes を読み、参照整合検査が正常終了 | 可 |

`ready` は読取・参照整合が正常という意味だけで、人間承認を含まない。旧 combined enum
`missing / invalid / draft / stale / unavailable / ready` を受け取る adapter は、`draft` を
`authoredLifecycle: draft` に分ける。原文 bytes と参照先 snapshot を再検証できた場合だけ
`readState: ready` とし、再検証不能なら cache の有無に応じ `stale` または `unavailable` と
`legacy_draft_unverified` 診断を返す。新規 API は `draft` を read state として返さない。

### 本文 lifecycle `authoredLifecycle`

本文 frontmatter が表す作成段階を `draft / review / published / retired` として扱う。
これは作者側の lifecycle であり、人間承認の証跡ではない。旧 `status: approved` は互換 reader が
`published` に写像し `legacy_authored_status` を出してよいが、それだけで approval を作らない。

### 版別承認 `approvalState`

`unknown / unavailable / unreviewed / approved / changes_requested / revoked / stale` を別保存する。
`unreviewed` は権限ある承認 provider への照会が成功し、対象版の承認 record が無い状態である。
provider が未対応または authoritative store を特定できない場合は `unknown`、provider への照会が
失敗した場合は `unavailable` とし、どちらも「未承認と確認済み」にしない。承認の identity は
`repositoryId / documentId / contentHash / approvalScope` に結び付け、`branch / revision` は承認時の
来歴と、承認 scope が明示的に branch / revision を制約する場合の照合値として記録する。
無関係な commit や merge だけで同じ本文の承認を失効させない。一方、対象本文、参照する価値・制約・
依存文書の fingerprint、承認 scope、承認権限が変わった場合は再評価する。再評価の対象となった
承認、すなわち承認時の `contentHash` または依存 fingerprint が現在版と一致しない承認は
`stale` とし、`approved` として扱わない。record はさらに
`approverRole / approvedAt / recordId` を持つ。
`ready + unreviewed` は閲覧・対話・変更提案に使えるが、承認済み UX を要求する委託や受け入れは拒否する。
`ready + unknown` と `ready + unavailable` も本文閲覧はできるが、承認必須の行為は拒否し、確認不能の
理由を表示する。
`readState: stale` の版を新たに承認しない。

## 診断と cache freshness

診断は一件に短絡せず、独立に確認できた異常を `diagnostics[]` で同時に返す。例えば
重複文書 ID、重複価値 ID、`product_ux` 参照切れ、domain `specRefs` の片方向、repository 解決競合を
一応答で提示する。各診断は `code / severity / documentId? / path? / valueId? / relatedPath?` を持つ。
機密の repository path、remote credential、本文断片は既定で含めない。

cache は `fetchedAt / sourceBranch / sourceRevision / sourceContentHash / requestedBranch /
requestedRevision / dependencyFingerprints[]` を保持する。dependency fingerprint は参照先 UX 文書、
product UX、domain 定義とその `specRefs` 等の `{ repositoryId, path, documentId?, contentHash }` を含む。
freshness は時刻や元文書 hash だけでなく、要求した branch revision の参照 snapshot 全体が同じかで
判定する。元文書 hash が同じでも参照先 UX / domain spec が変わった古い snapshot は `stale` とする。
provider が現行 revision と依存 fingerprint を確認できないとき、cache を `ready` に昇格させない。
stale cache と provider 障害が同時なら `readState: stale` と `provider_unavailable` 診断を返す。

## v1 API payload 案（未実装）

An は登録済み repository を解決した後に、例えば
`GET /api/v1/projects/{projectId}/ux-documents?branch=<branch>&revision=<revision>` から次を返す。
endpoint 名を含めて後続 An task で現行 route 規約と照合する。

```json
{
  "contractVersion": 1,
  "repository": { "repositoryId": "an-stable-id", "branch": "main", "revision": "abc123" },
  "documents": [{
    "path": "spec/ux/product.md",
    "documentId": "UX-PRODUCT",
    "contentHash": "<sha256>",
    "readState": "ready",
    "authoredLifecycle": "draft",
    "approval": { "state": "unreviewed", "scope": "document", "recordId": null },
    "valueIds": ["UX-W1"],
    "sourceText": "---\n...\n---\n# Product UX\n...",
    "ux": {
      "title": "Product UX",
      "uxScope": "product",
      "domain": null,
      "productUx": null,
      "values": [{
        "valueId": "UX-W1",
        "statement": "利用者に起きる望ましい変化",
        "criteria": "判断方法・条件",
        "evidence": "証拠",
        "status": "未測定"
      }],
      "bodyMarkdown": "# Product UX\n..."
    },
    "diagnostics": []
  }],
  "cache": {
    "fetchedAt": "2026-09-07T00:00:00Z",
    "sourceBranch": "main",
    "sourceRevision": "abc123",
    "dependencyFingerprints": []
  }
}
```

collection は取得できた snapshot について HTTP 200 を返し、文書単位の異常を失わず並べる。
`ready` document は上例の non-null `documentId / contentHash / sourceText / ux` を持つ。
`ready` 以外の document も `path / readState / diagnostics` を必須とする。`missing` は
`documentId` が null になるため、`path` が唯一の識別子である。
`invalid` document は取得できた bytes の hash は保持するが、
UTF-8 decode 不能なら `sourceText: null`、構文抽出不能なら `ux: null` とする。要求 path が無い
`missing` document は `documentId / contentHash / sourceText / ux: null` とする。権限や provider 障害で
bytes を取得できない `unavailable` も同じ nullable field と原因診断を持つ。これにより invalid / missing を
空配列と区別し、他文書の同時診断も返せる。HTTP 422 は query や request schema 自体が不正な場合に限り、
文書内容の `invalid` は collection 全体を 422 にしない。

Pf は `anatomiaRepo` を An の正規登録へ解決して、例えば
`GET /api/v1/anatomia/repos/{anatomiaRepo}/ux-context?branch=<branch>&revision=<revision>` から、
上記識別子と状態を失わない射影を返す。Pf は resolver の検証結果を `repositoryResolution` として
`resolved / ambiguous / unregistered / forbidden` のいずれかで示す。具体 endpoint と認可方式は
後続 Pf task で現行 route / schema と照合する。

共通エラー envelope 案:

```json
{ "error": { "code": "UX_REPOSITORY_AMBIGUOUS", "message": "Repository registration is ambiguous", "retryable": false, "diagnostics": [] } }
```

少なくとも `UX_REPOSITORY_UNREGISTERED` (404)、`UX_REPOSITORY_AMBIGUOUS` (409)、
`UX_REVISION_NOT_FOUND` (404)、`UX_ACCESS_FORBIDDEN` (403)、`UX_SOURCE_UNAVAILABLE` (503)、
`UX_REQUEST_INVALID` (422) を成功 payload と区別する。文書内容の不正は HTTP 200 内の
`readState: invalid` と document 診断で返す。private repository の取得権限は An の
server-side credential 境界に置き、Pf / browser / LLM へ token、credential 付き remote、local root を渡さない。
ただし server credential が読めるという理由だけで任意の利用者へ開示しない。Pf は認証済み subject と
要求 scope を改ざん不能な service 間 context として An へ渡して An が認可するか、Pf が対象 repository の
閲覧権限を事前認可した証跡を渡す。閲覧、変更提案、承認の権限は別々に検査する。

## 受け入れケース

以下は後続実装で実行するケースであり、本 PR では実行しない。

| 入力・状況 | 期待結果 |
|---|---|
| 同じ raw bytes を An と Pf が読む | 4識別子、revision、価値 ID が一致する |
| LF と CRLF、BOM 有無、末尾空白のいずれかだけを変更 | `contentHash` が変わり、旧 approval は `stale` |
| `ready` の draft、承認 record 無し | 閲覧可、`unreviewed`、承認必須の委託・受け入れ不可 |
| `ready`、承認 provider 未対応 | 閲覧可、`unknown`、承認必須の委託・受け入れ不可 |
| `ready`、承認 provider の照会失敗 | 閲覧可、`unavailable` と原因診断、承認必須の行為不可 |
| legacy combined state が `draft`、原文と参照を再検証成功 | `ready + draft` に分解し、承認を推測しない |
| legacy combined state が `draft`、provider 停止で再検証不能 | cache に応じ `stale` / `unavailable`、`ready` にしない |
| 一文書に `UX-W1` が二件 | `invalid` と `duplicate_value_id` |
| 別文書に同じ `UX-W1` | 単独では異常にせず文書 ID と組で参照 |
| 新旧価値見出しの文書 | どちらも同じ抽出結果になる |
| 要求 payload の `valueIds` と `winIds` が不一致 | `UX_REQUEST_INVALID` (422) と `conflicting_value_id_fields`。一方を推測しない |
| `product_ux` 切れ、価値 ID 重複、repository alias 競合が同時発生 | 三診断を同時に返す |
| main の cache を feature branch として要求 | `stale`。現行版の承認・委託に使わない |
| 元文書 hash は同じだが参照先 domain spec が変更 | dependency fingerprint 不一致で `stale` |
| stale cache があり provider も停止 | stale 本文を明示表示し `provider_unavailable` も返す |
| private repository の閲覧権限無し | 403。存在詳細、token、local path を漏らさない |
| server credential は読取可だが利用者 subject は権限無し | 403。server 権限だけで開示しない |
| 同名だが remote が異なる二 repository | resolver は `ambiguous`、一方を推測しない |
| 非 UI の API / CLI UX | 画面定義なしで問題・価値・シナリオを返す |

## 後続所有者

An は registry resolver、raw bytes 読取、構文・参照診断、plan 供給を所有する。Pf は
`anatomiaRepo` 解決、射影、閲覧・提案・承認の権限境界を所有する。Cc は委託時の識別子と版固定、
Revisor は提出物と固定版の独立受け入れを所有する。各 repository は着手前に
Concordia の `spec/feature/task-workflow.md` §2.1 (md 正本・本文のみ) 形式の task を
その repository に新規保存する。本 PR は AIFormat の共通契約だけを変更する。
