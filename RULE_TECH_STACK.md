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

## Foundation (共通 UI デザインシステム)

LUDIARS の全 Web フロントエンド (Ars, Schedula, Cernere 等) は **Foundation** デザインシステムに従う。

### デザイントークン (CSS Custom Properties)

全プロジェクトで以下の CSS 変数を共有する。`global.css` または `index.css` の `:root` で定義する。

| カテゴリ | 変数 | 用途 |
|---------|------|------|
| 背景 | `--bg`, `--bg-surface`, `--bg-surface-2` | レイヤー階層 |
| テキスト | `--text`, `--text-muted` | 本文 / 補助 |
| ボーダー | `--border` | 区切り線 |
| アクセント | `--accent`, `--accent-hover` | プライマリアクション |
| セマンティック | `--green`, `--orange`, `--red`, `--purple`, `--pink` | 状態表示 |
| 角丸 | `--radius`, `--radius-sm` | コンポーネント |

### スタイリング

| 分類 | 技術 |
|------|------|
| CSS フレームワーク | Tailwind CSS 4 (`@tailwindcss/vite`) |
| コンポーネント | インラインスタイル (`style={{ ... }}`) + Tailwind ユーティリティ |
| テーマ | ダークテーマ基本。CSS 変数で制御 |

### モバイル対応 (スマホ縦画面)

全 Web サービスはスマホ縦画面 (portrait) に対応する。

| ブレークポイント | 用途 |
|----------------|------|
| `max-width: 767px` | モバイル (スマホ縦画面) |
| `max-width: 1024px` | タブレット |
| `min-width: 768px` | デスクトップ |

モバイル UI の原則:
- **タッチ操作前提**: ボタンは最低 44px タッチターゲット
- **ドロワー / ボトムシート**: サイドバーの代替
- **FAB (Floating Action Button)**: 主要アクション
- **スワイプ / スクロール**: パネル切り替え
- React Flow のノードキャンバスはピンチズーム・パンで操作

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

## npm scripts クロスプラットフォームルール

npm scripts は Windows (cmd.exe) と Linux/macOS (bash) の両方で動作する記法を使用する。

### 禁止パターンと代替

| 禁止 | 理由 | 代替 |
|------|------|------|
| `cmd1 & cmd2 & wait` | `&` バックグラウンド実行は bash 専用 | `concurrently` パッケージを使用 |
| `cd dir && cmd` | `&&` は動くが `cd` のスコープが環境依存 | ツール側の `--workdir` オプション、または環境変数で制御 |
| シングルクォート `'...'` | cmd.exe はシングルクォートを認識しない | ダブルクォート `\"...\"` にエスケープ |
| `$(cmd)` コマンド置換 | bash 専用 | 環境変数または設定ファイルで事前定義 |
| `export VAR=val` | bash 専用 | `dotenv-cli` で `.env` から読み込み |
| `source .env` / `. .env` | bash 専用 | `dotenv-cli` で `.env` から読み込み |
| `set -a` | bash 専用 | `dotenv-cli` で `.env` から読み込み |

### 推奨ツール

| 用途 | ツール |
|------|--------|
| 並列実行 | `concurrently` (`-n name1,name2 -c color1,color2`) |
| 環境変数注入 | `dotenv-cli` (`dotenv-cli -- cmd`) |
| ディレクトリ変更 | ツールの `--workdir` オプション (例: `cargo watch --workdir dir`) |

### 記述例

```json
{
  "dev:full": "concurrently -n vite,axum -c cyan,green \"npm run dev\" \"npm run dev:server\"",
  "dev": "npm run env:env && npx dotenv-cli -- npm run dev:full",
  "dev:server": "cargo watch --workdir src-tauri -x \"run --features web-server\""
}
```

## クライアントアプリ

| 分類 | 技術 |
|------|------|
| デスクトップ | Tauri (Rust + React) |
| CLI ツール | Rust (clap) |
| レンダリング | C++ (Vulkan / WebGL) |
