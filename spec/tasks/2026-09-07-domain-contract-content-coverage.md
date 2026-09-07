---
task: domain-contract-content-coverage
project: AIFormat
kind: レビュー
created: 2026-09-07
memory_links:
  - spec/tasks/core-domain-ux-contract-sample.md
  - spec/interface/core-domain-ux-consumers.md
  - FORMAT_UX.md
---
# コンテンツ別の UX と契約観測の適用範囲を評価する

## 目的

TypeScript / ESM の同期サンプルから、すべてのコンテンツに適用可能という結論へ飛躍せず、対応範囲・限界・追加アダプターを評価する。

## 完了条件

- Web UI、非 UI API/CLI、非同期・イベント処理、Unity/C# 等のリアルタイム処理、生成物・文書について比較表を作る。
- 各分類で UX の勝利条件、機械検査可能な不変条件、人間評価が必要な条件、観測方法、負荷、プライバシー、障害時の扱いを示す。
- 実証済み・設計のみ・未対応を根拠付きで区別し、追加サンプルの優先順位と受け入れ条件を示す。
- 共通 UX 参照契約および本番契約観測の導入仕様との依存関係を記載する。追加ランタイムの実装は所有リポが確定してから別タスクにする。

## スコープ (編集可ディレクトリ)

spec/feature/、spec/interface/、FORMAT_UX.md、examples/core-domain-task/README.md。アプリ起動や実測は明示承認後の別作業とする。

## 作業条件

着手時に対象リポと実 checkout branch を確認し Cc に登録する。テスト・サンプル実行・サービス起動はユーザーの明示指示なしに行わない。実行が必要な確認は条件と手順を引き継ぐ。進行状態は Concordia の taskflow_task_state に保持し、この task md に書き戻さない。
