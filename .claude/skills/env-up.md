---
description: Infisical + env-cli による環境変数管理と Docker Compose 起動ルール。新規サービスのセットアップ、docker-compose.yaml 作成時に適用。
globs: ["**/docker-compose*.yaml", "**/env-cli.config.ts", "**/packages/env-cli/**"]
---

# env:up 起動ルール

LUDIARS の各サービスは `npm run env:up` で起動する。Infisical からシークレットを取得し、`.env` を一時生成して `docker compose up` を実行、終了後に `.env` を自動削除する。

## 起動モード

| コマンド | モード | DB/Redis | 説明 |
|---------|--------|----------|------|
| `npm run env:up` | dev | 外部 (Infra) | ホットリロード開発 |
| `npm run env:up:prod` | prod | 外部 (Infra) | ビルド済みイメージ本番 |
| `npm run env:up:standalone` | standalone | 内蔵 | DB 込み All-in-One 本番 |
| `npm run env:up:standalone:dev` | standalone-dev | 内蔵 | DB 込み All-in-One 開発 |

## Docker Compose ファイル構成

新規サービスは以下の 2 ファイル構成に従う。

### docker-compose.yaml (基本)

フロントエンド + バックエンドのみ。DB/Redis は外部前提。

```yaml
services:
  backend:
    build: ./server
    ports: ["8080:8080"]
    environment:
      DATABASE_URL: "${DATABASE_URL}"
      REDIS_URL: "${REDIS_URL}"

  frontend:
    build: ./frontend
    ports: ["80:80"]

  # --profile dev で有効化
  backend-dev:
    image: node:22-alpine
    command: sh -c "npm install && npx tsx watch src/index.ts"
    volumes: [./server:/app/server]
    profiles: [dev]

  frontend-dev:
    image: node:22-alpine
    command: sh -c "npm install && npm run dev -- --host 0.0.0.0"
    volumes: [./frontend:/app/frontend]
    profiles: [dev]
```

### docker-compose.standalone.yaml (All-in-One)

PostgreSQL + Redis を追加。重ねて使用する。

```yaml
services:
  postgres:
    image: postgres:17-alpine
    healthcheck: ...

  redis:
    image: redis:7-alpine
    healthcheck: ...

  # backend の接続先を上書き
  backend:
    environment:
      DATABASE_URL: "postgresql://user:pass@postgres:5432/dbname"
      REDIS_URL: "redis://redis:6379"
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
```

## env-cli.config.ts

プロジェクトルートに配置。Infisical のキー定義とデフォルト値を記述する。

```typescript
import type { EnvCliConfig } from "./packages/env-cli/src/types.js";

const config: EnvCliConfig = {
  name: "MyService",
  infraKeys: {
    DATABASE_URL: "postgresql://...",
    REDIS_URL: "redis://...",
    JWT_SECRET: "",
    // ...
  },
};
export default config;
```

## package.json scripts

```json
{
  "scripts": {
    "env:setup": "npx tsx packages/env-cli/src/cli.ts setup",
    "env:initialize": "npx tsx packages/env-cli/src/cli.ts initialize",
    "env:gen": "npx tsx packages/env-cli/src/cli.ts env",
    "env:up": "npx tsx packages/env-cli/src/cli.ts up dev",
    "env:up:prod": "npx tsx packages/env-cli/src/cli.ts up prod",
    "env:up:standalone": "npx tsx packages/env-cli/src/cli.ts up standalone",
    "env:up:standalone:dev": "npx tsx packages/env-cli/src/cli.ts up standalone-dev"
  }
}
```

## 初回セットアップ手順

```bash
npm run env:setup        # Infisical 認証情報を対話入力
npm run env:initialize   # infraKeys のデフォルト値を Infisical に登録
npm run env:up           # 起動
```
