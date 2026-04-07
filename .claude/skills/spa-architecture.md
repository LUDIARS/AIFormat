# SPA アーキテクチャスキル

LUDIARS ファミリーの Web サービスはすべて SPA (Single Page Application) 構成とする。

## 技術スタック

- **React 19** + **React Router 7** (BrowserRouter)
- **TypeScript** + **Vite**
- **WebSocket** 常時接続セッション (Cernere プロトコル準拠)

## 設計原則

- 破壊的操作（作成・更新・削除）は **WS module_request 経由**で実行する。REST API は読み取り専用
- リアルタイム通知は WS notification メッセージでサーバーからプッシュする
- 本番環境では **Nginx** で SPA fallback (`try_files $uri $uri/ /index.html`) + API/WS リバースプロキシ構成
- WS 接続は認証後に自動確立し、Ping/Pong で維持。切断時は指数バックオフで自動再接続

## フロントエンド構成パターン

```
frontend/
  src/
    contexts/AuthContext.tsx    # 認証 + WS 接続管理
    hooks/useWsEvent.ts         # リアルタイム通知購読フック
    lib/ws-client.ts            # WS クライアント (module_request/response)
    lib/ws-commands.ts          # 型付き WS コマンドヘルパー
    lib/api.ts                  # REST API (読み取り専用)
    pages/                      # SPA ページコンポーネント
  vite.config.ts                # /ws, /api プロキシ設定
  nginx.conf                    # 本番 SPA + WS 設定
```

## 新規サービス作成時

1. Vite + React 19 でフロントエンドを初期化
2. WS クライアントを実装 (Cernere module_request/response プロトコル)
3. 破壊的操作は WS コマンドとして実装
4. REST は読み取り操作のみ
5. Nginx で SPA fallback + API/WS リバースプロキシを構成
