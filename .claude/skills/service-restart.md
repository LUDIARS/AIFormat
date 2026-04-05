---
description: サービス修正後の再起動判定。ホットデプロイ可否で実行を分岐する。
globs: ["**/docker-compose*.yaml", "**/docker-compose*.yml", "**/src/**", "**/server/**"]
---

# サービス再起動ルール

サービスに修正を入れた際、以下の判定フローに従う。

## 判定フロー

```
修正を入れた
  ├─ ホットデプロイ可能? (tsx watch, cargo watch, vite dev 等)
  │   └─ Yes → 何もしない (自動反映される)
  │
  └─ No → env-cli を持つ Web サービスで Docker 起動?
      ├─ Yes → docker compose down && npm run env:up
      └─ No → 何もしない (手動再起動を案内)
```

## ホットデプロイ可能な場合

以下のケースはファイル保存で自動反映されるため、再起動不要:

- `tsx watch` で起動しているバックエンド (Cernere server, Schedula 等)
- `vite dev` で起動しているフロントエンド
- `cargo watch` で起動している Rust サービス

## ホットデプロイ不可の場合

### env-cli + Docker 環境

`package.json` に `env:up` スクリプトがあり、`docker-compose.yaml` が存在する場合:

```bash
docker compose down
npm run env:up
```

### それ以外

何もしない。ユーザーに手動再起動を案内する。

## 判定に必要なファイル確認

1. `docker-compose.yaml` または `docker-compose.yml` が存在するか
2. `package.json` の `scripts` に `env:up` があるか
3. `docker-compose.yaml` 内の `command` に `watch` や `dev` が含まれるか (ホットデプロイ判定)
