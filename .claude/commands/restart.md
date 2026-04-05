---
description: サービスを再起動する。ホットデプロイ可能な場合はスキップ。
---

# /restart $ARGUMENTS

サービス「$ARGUMENTS」を再起動する。

## 手順

1. **ホットデプロイ判定**
   - `docker-compose.yaml` の該当サービスの `command` に `watch` または `dev` が含まれるか確認
   - 含まれる場合 → 「ホットデプロイ対応のため再起動不要です」と報告して終了

2. **env-cli + Docker 判定**
   - `package.json` に `env:up` スクリプトが存在するか確認
   - `docker-compose.yaml` が存在するか確認
   - 両方存在する場合 → 以下を実行:
     ```bash
     docker compose down
     npm run env:up
     ```

3. **それ以外**
   - 「自動再起動に対応していない環境です。手動で再起動してください。」と報告

## サービス名の指定

- `$ARGUMENTS` が空の場合: 全サービスを対象に判定
- `$ARGUMENTS` にサービス名が指定された場合: `docker compose restart $ARGUMENTS` で個別再起動を試みる
  - ただしホットデプロイ対応サービスの場合はスキップ

## 例

```
/restart           → 全サービス再起動 (ホットデプロイ対応分はスキップ)
/restart backend   → backend サービスのみ再起動
/restart postgres  → postgres サービスのみ再起動
```
