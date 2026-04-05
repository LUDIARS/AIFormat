---
description: サービス修正後の再起動判定。ホットデプロイ可否で実行を分岐する。
globs: ["**/docker-compose*.yaml", "**/docker-compose*.yml", "**/src/**", "**/server/**", "**/vite.config.*"]
---

# サービス再起動ルール

サービスに修正を入れた際、以下の判定フローに従う。

## 判定フロー

```
修正を入れた
  ├─ 設定ファイルの変更? (vite.config.*, tsconfig.*, package.json 等)
  │   └─ Yes → 該当サービスを再起動 (docker compose restart <service>)
  │
  ├─ ソースコードの変更でホットデプロイ可能?
  │   └─ Yes → 何もしない (自動反映される)
  │
  └─ No → env-cli を持つ Web サービスで Docker 起動?
      ├─ Yes → docker compose down && npm run env:up
      └─ No → 何もしない (手動再起動を案内)
```

## 再起動が必要な設定ファイル

以下のファイルが変更された場合、ホットリロードでは反映されない。該当サービスの再起動が必要:

| ファイル | 該当サービス | コマンド |
|---------|------------|---------|
| `vite.config.ts` / `vite.config.js` | frontend | `docker compose restart frontend` |
| `tsconfig.json` | backend / frontend | `docker compose restart <service>` |
| `package.json` (dependencies 変更) | backend / frontend | `docker compose restart <service>` |
| `docker-compose.yaml` | 全サービス | `docker compose down && npm run env:up` |
| `.env` / `.env.secrets` | 全サービス | `docker compose down && npm run env:up` |

## ホットデプロイ可能 (再起動不要)

以下はソースコード変更時にファイル保存で自動反映される:

- `tsx watch` で起動しているバックエンド (src/**/*.ts)
- `vite dev` で起動しているフロントエンド (src/**/*.tsx, src/**/*.ts, src/**/*.css)
- `cargo watch` で起動している Rust サービス

## ホットデプロイ不可の場合

### 個別サービス再起動

特定のサービスのみ再起動する場合:

```bash
docker compose restart <service>  # 例: docker compose restart frontend
```

### 全サービス再起動 (env-cli + Docker 環境)

`package.json` に `env:up` スクリプトがあり、`docker-compose.yaml` が存在する場合:

```bash
docker compose down
npm run env:up
```

### それ以外

何もしない。ユーザーに手動再起動を案内する。
