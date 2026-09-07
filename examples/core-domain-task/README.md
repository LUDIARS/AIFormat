# UX → ドメイン → 契約 → 証跡のサンプル

題材は Cc のタスク受け入れ。実サービスとは接続しない独立サンプルで、
UX の「勝ち」から実装と検証までを読み通せる最小構成。

## 読む順序

1. [プロダクト UX](spec/ux/product.md): 依頼者が何に困り、何を勝ちとするか。
2. [コアドメイン UX](spec/ux/task-completion.md): その勝ちに完了判断がどう貢献するか。
3. [ドメイン定義](spec/domains/task-completion.domain.json) / [業務仕様](spec/feature/task-completion.md): 責務と不変条件。
4. [契約](contracts/complete-task.contract.mjs): 実装とは独立した事後条件。
5. [業務実装](domain/complete-task.mjs): 観測を知らない純粋関数。
6. [観測](runtime/observe.mjs) / [受け入れ](runtime/acceptance.mjs): 実行と現在版の照合。

Anatomia / Praeforma が参照する UX は同じファイル。書式は [FORMAT_UX.md](../../FORMAT_UX.md)、
consumer の契約は [共通参照仕様](../../spec/interface/core-domain-ux-consumers.md)。
ここに存在するのは資料と実行サンプルで、両サービスの自動読取を有効にするものではない。

## 実行方法 (明示的に検証を許可された時のみ)

Node.js 22 以降。依存インストール、ビルド、ネットワーク、サーバは不要。
AIFormat 本体に取り込まれた後、プロジェクト本体のフォルダから実行する。
Cc Session では指定の testing claim/release とユーザーの実行許可に従う。

```sh
node examples/core-domain-task/demo.mjs
node --test examples/core-domain-task/test/domain.test.mjs examples/core-domain-task/test/acceptance.test.mjs examples/core-domain-task/test/revision.test.mjs
```

期待値 (未実行): ready は completed、missing は open と未達 ID、empty は open と missing-criteria。
三シナリオで契約が満たされると `verdict.accepted: true`。これは**サンプルの機械条件だけ**の合格で、
`uxReview: draft-not-approved` は変わらず、プロダクトの勝ちや UX の人間承認を意味しない。

テストには意図的に誤った実装・入力破壊・述語例外・未観測・欠落契約・古い証跡・
観測不能の拒否を含める。故障版はテスト内だけに置き、demo へ切替フラグを設けない。
不正入力の送出は契約上の正常動作 (`observed`) とし、不正入力へ結果を返す実装は違反として扱う。
この変更を作成したセッションではテストも demo も実行していない。

## 強制の範囲

`policy.json` は受け入れ側が要求する契約とシナリオ。イベントから必須条件を推測しない。
コード・契約・UX・ポリシーを含む全サンプルの内容ハッシュと、独立した runId を証跡に付ける。
開始と終了でハッシュを取得し、実行中に内容が変わった場合もその証跡では合格しない。
版固定の本番運用は immutable checkout / trusted runner を使い、変更して戻す競合も防ぐ。

受け入れ判定器と観測器を含む全ソースが編集可能なこの教材は、悪意ある改ざんへの防御境界ではない。
製品導入では契約要求、UX 承認、判定器、ログ保管を実装エージェントの権限から分離する。
現在版で再実行して通った場合、過去の違反は履歴として保持しつつ受け入れ対象から分ける。

## ランタイムと適用限界

手元の Lapilli `main` に `contract()` の公開実装が無いため、ここでは同期関数専用の
参照アダプターを明示的に使う。Augur `contract-wrap` の自動注入・公開 API の代用品として配布しない。
本番への接続は Lapilli / Augur / Cc の別 PR で行う。

引数は structured-cloneable な値に限る。述語は純粋関数であること。
Promise / generator / callback 完了、並行実行、時間予算、描画結果の保証は対象外。
非同期の戻り値は契約外として送出するが、既に実行された呼出しは `violated` として証跡に残す。
送出だけを行って証跡を残さないと、証跡不足のまま complete な receipt が作れてしまうため。
`sample=1` 相当で全呼出しを記録し、引数や戻り値をログに流さない。
`durationMs` は monotonic clock で測る同期業務処理の所要時間 (snapshot と述語評価は含めない)。
単一呼出しの測定値を性能目標の達成証拠にはしない。性能評価には別途母集団と予算を定義する。
実際の UX 理解、画面操作、競合、C++ / Unity 等は別のシナリオとアダプターが必要。

## Codex に渡す作業指示の例

このサンプルを読み、対象プロダクトの UX を先に下書きする。勝ち ID とドメインを結び、
必要な契約・シナリオを計画してから実装する。機械の合格と UX の人間承認を分けて報告する。
テスト禁止なら実行せず未検証で提出する。フックによる自動実行も禁止を迂回する手段にしない。
