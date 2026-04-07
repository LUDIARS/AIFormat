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

## クライアントアプリ

| 分類 | 技術 |
|------|------|
| デスクトップ | Tauri (Rust + React) |
| CLI ツール | Rust (clap) |
| レンダリング | C++ (Vulkan / WebGL) |
