# 基盤設計ルール

## 1. 認証・セッション管理

LUDIARS のサービス認証系は全て **Cernere** に従う。

- リポジトリ: https://github.com/LUDIARS/Cernere
- 各サービスは Cernere を通してセッションを作成する
- セッション以外での破壊的変更を伴う REST 操作は行わない

## 2. マイクロサービスアーキテクチャ

LUDIARS はマイクロサービスアーキテクチャに従う。

- サービスマップ: https://github.com/LUDIARS/LUDIARS
- サービスの役割を増やした場合、またはサービスを追加した場合はサービスマップに追記する
