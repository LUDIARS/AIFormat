# 技術スタックルール

LUDIARS の全プロジェクトは本ルールに従い技術を選定する。

## 言語選定基準

| 領域 | 言語 | 理由 |
|------|------|------|
| **サーバーサイド** | TypeScript | ビルド軽量、npm エコシステム、チーム共通スタック |
| **クライアントアプリ** | Rust | パフォーマンス、型安全性、ネイティブ配布 |
| **レンダリングエンジン** | C++ | GPU パイプライン、プラットフォーム制御 |

## サーバーサイド共通スタック

| 分類 | 技術 |
|------|------|
| Web フレームワーク | Hono |
| HTTP サーバー | @hono/node-server |
| ORM | Drizzle ORM |
| データベース | PostgreSQL |
| セッション / キャッシュ | Redis (ioredis) |
| 認証 | jsonwebtoken + bcryptjs |
| バリデーション | Zod |
| ランタイム | Node.js 22+ |

## フロントエンド (Web)

LUDIARS ファミリーの Web サービスはすべて **SPA (Single Page Application)** 構成とする。

| 分類 | 技術 |
|------|------|
| フレームワーク | React 19 |
| ルーティング | React Router 7 (BrowserRouter) |
| 言語 | TypeScript |
| ビルド | Vite |
| リアルタイム通信 | WebSocket (常時接続セッション) |
| 破壊的操作 | WS module_request 経由 (REST は読み取り専用) |
| 本番配信 | Nginx (SPA fallback + API/WS リバースプロキシ) |

## DB アクセスルール

全サービスで **Drizzle ORM** を使用する。

- スキーマ定義は `src/db/schema.ts` に `pgTable` で記述する
- DB アクセスは必ず **リポジトリ層** (`src/db/repository.ts`) を経由する。ルートハンドラから直接 Drizzle を呼ばない
- 型は `typeof table.$inferSelect` / `$inferInsert` で推論する
- GIN インデックス等 Drizzle で表現できないものは `migrations/` の SQL で定義する
- Drizzle Studio (`npx drizzle-kit studio`) を DB 閲覧ツールとして使用可能

## 共有インフラ

LUDIARS の全サービスは共有インフラ ([LUDIARS/Infra](https://github.com/LUDIARS/Infra)) の PostgreSQL / Redis を使用できる。

- PostgreSQL: サービスごとにデータベースを分離（`cernere`, `schedula`, `curare` 等）
- Redis: DB 番号で分離（`/0`, `/1`, `/2` 等）
- MinIO: Curare 等オブジェクトストレージが必要なサービスのみ使用
- DB 閲覧: pgweb (`http://localhost:8081`) または Drizzle Studio

各サービスの `docker-compose.yaml` は DB/Redis を含めない（外部前提）。単体運用が必要な場合は `docker-compose.standalone.yaml` を重ねて使用する。

## 環境変数・起動管理

### Infisical + env-cli

環境変数は [Infisical](https://infisical.com) で管理し、`@cernere/env-cli` で操作する。

```bash
npm run env:setup        # Infisical 初回設定
npm run env:initialize   # デフォルト値を Infisical に登録
npm run env:gen          # .env 生成
```

### Docker Compose 起動

各サービスは `npm run env:up` で Infisical → `.env` 一時生成 → `docker compose up` → `.env` 自動削除の流れで起動する。

```bash
npm run env:up                 # 開発 (ホットリロード, 外部 DB)
npm run env:up:prod            # 本番 (ビルド済みイメージ, 外部 DB)
npm run env:up:standalone      # All-in-One 本番 (DB 内蔵)
npm run env:up:standalone:dev  # All-in-One 開発 (DB 内蔵 + ホットリロード)
```

### Docker Compose ファイル構成

| ファイル | 用途 |
|---------|------|
| `docker-compose.yaml` | 基本構成（フロント + バックエンド）。DB は外部前提。`--profile dev` で開発モード |
| `docker-compose.standalone.yaml` | All-in-One 用。PostgreSQL + Redis を追加。重ねて使用 |

新規サービス作成時はこの 2 ファイル構成に従う。

## クライアントアプリ

| 分類 | 技術 |
|------|------|
| デスクトップ | Tauri (Rust + React) |
| CLI ツール | Rust (clap) |
| レンダリング | C++ (Vulkan / WebGL) |
