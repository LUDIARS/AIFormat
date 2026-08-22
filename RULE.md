# 基盤設計ルール

## 1. 認証・セッション管理

LUDIARS のサービス認証系は全て **Cernere** に従う。

- リポジトリ: https://github.com/LUDIARS/Cernere
- 各サービスは Cernere を通してセッションを作成する
- セッション以外での破壊的変更を伴う REST 操作は行わない

### 1.1 Cernere 概要

Cernere は汎用認証プラットフォーム & データリレーサーバーである。常時接続セッション（Always-Connected Session）を基盤とし、破壊的操作は認証済みかつ接続中のセッションからのみ受け付ける。

| レイヤー | 技術 |
|----------|------|
| サーバー | TypeScript / Hono (Node.js) |
| データベース | PostgreSQL 17 (Drizzle ORM) |
| セッションストア | Redis 7（TTL 7日） |
| 認証方式 | GitHub OAuth / Google OAuth / bcrypt パスワード |
| MFA | TOTP / SMS (AWS SNS) / Email (AWS SES) |
| トークン | JWT（アクセス: 60分、リフレッシュ: 30日） |
| フロントエンド | React 19 + React Router 7 + TypeScript + Vite |

### 1.2 実装手順

各サービスが Cernere を導入する際の手順を以下に示す。

#### Step 1: WebSocket 接続の確立

Cernere との通信は WebSocket を通じて行う。REST API は `/auth` エンドポイントのみ公開され、それ以外の全操作は認証済み WebSocket セッション経由で実行する。

```
# 新規接続（JWT 認証）
GET /ws?token=<jwt>

# 再接続（セッション ID）
GET /ws?session_id=<id>
```

接続成功時、サーバーからの応答:

```json
{ "type": "connected", "session_id": "...", "user_state": {...} }
```

#### Step 2: Ping/Pong による常時接続の維持

サーバーは 30 秒間隔で `ping` を送信する。クライアントは 10 秒以内に `pong` を返す必要がある。タイムアウト時はセッションが `SessionExpired` に遷移し、再認証が必要になる。

```json
// サーバー → クライアント
{ "type": "ping", "ts": 1234567890 }

// クライアント → サーバー
{ "type": "pong", "ts": 1234567890 }
```

#### Step 3: メッセージプロトコルの実装

全操作は `module_request` / `module_response` 形式で行う。

**リクエスト:**

```json
{
  "type": "module_request",
  "module": "<Module>",
  "action": "<Action>",
  "payload": { ... }
}
```

**レスポンス（成功）:**

```json
{
  "type": "module_response",
  "module": "<Module>",
  "action": "<Action>",
  "payload": { ... }
}
```

**レスポンス（エラー）:**

```json
{
  "type": "error",
  "code": "command_error",
  "message": "Error description"
}
```

#### Step 4: リレーメッセージの実装

セッション間通信（クロスデバイス同期等）にはリレー機能を使用する。デフォルトでは同一ユーザーのセッション間のみリレー可能。

```json
// ブロードキャスト（自分の他セッション全体）
{ "type": "relay", "target": "broadcast", "payload": {...} }

// 特定ユーザーの全セッション
{ "type": "relay", "target": {"user": "<user_id>"}, "payload": {...} }

// 特定セッション
{ "type": "relay", "target": {"session": "<session_id>"}, "payload": {...} }
```

受信側:

```json
{ "type": "relayed", "from_session": "<id>", "payload": {...} }
```

#### Step 5: 認可モデルの適用

Cernere は以下の権限階層を持つ。各サービスはこの権限モデルに従う。

**システムレベル:**

| ロール | 権限 |
|--------|------|
| `admin` | プロジェクト定義の管理（初回ログインユーザー） |
| `general` | 一般ユーザー |

**組織レベル:**

| ロール | 権限 |
|--------|------|
| `owner` | 組織の作成者。組織の削除が可能 |
| `admin` | メンバー管理、プロジェクトの有効化/無効化 |
| `member` | 読み取り専用。自己退出のみ可能 |

#### Step 6: 破壊的操作の防御層の実装

破壊的操作（削除・上書き・権限変更）には 4 層の防御を適用する。

1. **トークン検証** — セッション Cookie / Bearer Token の検証 → 失敗時 `401`
2. **Redis TTL チェック** — Redis 上のセッション存在確認（TTL 7日） → 失敗時 `401`
3. **ユーザー状態検証** — `LoggedIn` 状態であることを確認 → 失敗時 `403`
4. **リソース権限確認** — リソースの所有権・ロールの確認 → 失敗時 `403`

#### Step 7: セッション状態管理

Redis を用いたユーザー状態のライフサイクル:

```
None → LoggedIn → SessionExpired → LoggedIn（再認証）
  ↓
 None（TTL 失効後）
```

- Redis キー: `ustate:{user_id}`
- `LoggedIn` 状態のみ操作を許可
- 切断時は即座に `SessionExpired` へ遷移
- `SessionExpired` は再認証により `LoggedIn` へ復帰可能

#### Step 8: 監査ログの記録

全メソッド呼び出し（成功・失敗とも）は `operation_logs` テーブルに自動記録する。

記録項目: ユーザー ID / セッション ID / メソッド名 / パラメータ / ステータス / タイムスタンプ

### 1.3 セキュリティ設計原則

Cernere のセキュリティは以下の 3 つの柱に基づく。

1. **常時接続 WebSocket セッション** — 継続的な接続検証による認証維持
2. **堅牢な認証基盤** — 接続確立時の JWT/セッション ID 検証 + Redis 状態追跡
3. **破壊的操作の遮断** — 認証済みアクティブセッションを経由しない外部からの破壊的変更を完全にブロック

### 1.4 脅威モデルと対策

| 脅威 | 対策 |
|------|------|
| トークン窃取による不正使用 | 常時接続検証によりトークン単体では無効 |
| セッションハイジャック | Ping/Pong による生存確認 + 接続の一意性保証 |
| 未認証リクエストの注入 | WebSocket アップグレード時に JWT/セッション ID を必須化 |
| クロスユーザーリレーの悪用 | リレー権限を同一ユーザーセッションに限定 |
| 切断後の不正操作 | 即座に SessionExpired へ状態遷移 |

### 1.5 参考ドキュメント

- セキュリティ設計: https://github.com/LUDIARS/Cernere/blob/main/spec/security_design.md
- リレー設計: https://github.com/LUDIARS/Cernere/blob/main/docs/relay_design.md
- サービスインターフェース: https://github.com/LUDIARS/Cernere/blob/main/docs/service_interface.md

## 2. DB マイグレーション

全サービスは以下のルールに従い DB マイグレーションを管理する。

### ファイル管理

- `migrations/` に連番 SQL ファイルで管理: `{番号}_{説明}.sql`
- 番号は重複させない

### 冪等性

マイグレーションランナーは各 SQL ステートメントをセミコロンで分割し個別実行する。以下の PostgreSQL エラーコードはスキップして続行する:

| コード | 意味 |
|--------|------|
| `42P07` | relation already exists |
| `42701` | column already exists |
| `42710` | object already exists |
| `42P01` | relation does not exist (先行ステートメントがスキップされた場合) |
| `42704` | type does not exist |
| `23505` | duplicate key |

### 禁止事項

- `DROP TABLE` — テーブルは削除しない（論理削除 `is_active = false`）
- `DROP COLUMN` — カラムは削除しない（データ保全）
- `ALTER COLUMN ... TYPE` — 型変更は新カラム追加で対応
- マイグレーション番号の再利用・重複

### 推奨 SQL

```sql
CREATE TABLE IF NOT EXISTS my_table (...);
CREATE INDEX IF NOT EXISTS idx_name ON my_table (col);
ALTER TABLE my_table ADD COLUMN IF NOT EXISTS new_col TEXT;
```

## 3. マイクロサービスアーキテクチャ

LUDIARS はマイクロサービスアーキテクチャに従う。

- サービスマップ: https://github.com/LUDIARS/LUDIARS
- サービスの役割を増やした場合、またはサービスを追加した場合はサービスマップに追記する
- https://github.com/LUDIARS/LUDIARS/blob/main/ServiceMap.md

## 4. 設計原則

### 4.1 コア / モジュール分離

- **コア機能は最小実装のみ記述する。** コアには認証・セッション・基本データモデルなど、サービスの存在に不可欠な機能のみを含める。便利機能や拡張をコアに混ぜない
- **拡張機能はモジュール化し、着脱可能にする。** 各モジュールは独立したディレクトリに配置し、コアに依存してよいがコアはモジュールに依存しない。モジュールの有効化/無効化でサービスの動作が壊れてはならない

### 4.2 技術選定

- **Web サービス**（サーバーサイド + フロントエンド）は **TypeScript** で実装する
- **デスクトップアプリケーション**（ネイティブ機能を持つもの）は **Rust + Tauri** で実装する
- 技術スタックの詳細は `RULE_TECH_STACK.md` を参照

### 4.3 コード規約

- 言語・スタック横断の **コードを書くときの規約**（単一責任・ファイル分割・
  レイヤー依存方向・命名・例外処理等）は [`RULE_CODE.md`](./RULE_CODE.md) を
  正本とする
- レビューは [`common/REVIEW_CODE_QUALITY.md`](./common/REVIEW_CODE_QUALITY.md)
  で同規約の遵守を確認する

## 5. 個人データの保管禁止

LUDIARS の各サービスは、ユーザーの **個人データ** を独自の DB に保管してはいけない。
**Cernere を単一情報源 (single source of truth)** とし、各サービスは `id` を
FK アンカーとしてのみ保持する。

### 5.1 個人データの定義

以下を「個人データ」とみなし、各サービス DB に保管しない:

- 氏名 (`name`, `display_name`)
- メールアドレス (`email`)
- 認可ロール (`role`) — Cernere の権限モデルに従う
- パスワード関連 (`password_hash`, `salt`)
- OAuth トークン (`google_*`, `github_*`, `refresh_token`, `access_token`)
- 最終ログイン日時 (`last_login_at`)
- その他、ユーザー本人の属性とみなせるもの

### 5.2 取得方法

- 各サービスは Cernere の Profile API (`fetchCernereProfile(userId)`) で取得
- パフォーマンスのため Redis でキャッシュする (TTL 1時間程度)
- Cernere 未接続時のフォールバック (プレースホルダ表示) を実装する

### 5.3 既存サービスでの移行手順

1. 個人データ取得用のサービス層 (例: `src/auth/user-info.ts`) を作成し、
   `getUserInfo(userId)` API を提供
2. consumer コードを `userRepo.findById(id).name` から
   `getUserInfo(id).name` に置換
3. DB スキーマの該当カラムは **`DROP COLUMN 禁止` ルール** に従い残置
4. ただし `NOT NULL` / `UNIQUE` 制約は解除し、新規コードから読み書き
   しない旨をコメントで明示する

### 5.4 サービス固有フィールドは保持OK

各サービスのドメイン固有フィールド (例: Schedula の `major` 学科、
`calendar_access_id` Calendar 連携 nonce) で、Cernere に存在せず
そのサービスでのみ意味を持つものは引き続き各サービス DB に保存してよい。

### 5.5 なぜ？

- Cernere はユーザーデータの opt-out をサポートする方針。各サービスが
  個人データを持つと opt-out 時の整合性が取れない
- 個人情報は単一情報源 (Cernere) に集約することで GDPR 等への対応が容易
- 認証関連トークン (JWT, OAuth refresh token 等) も Cernere が責任を持つ

## 6. リポジトリ作業ルール (worktree 必須)

**作業時はメインチェックアウトでブランチを切り替えず、必ず `git worktree`
を使用すること。**

### 6.1 ルール

- main 以外のブランチでの編集・コミットは **worktree 経由で行う**
- メインチェックアウト (`<repo>` 直下) は基本 main に固定し、参照・リリース
  操作のみで使う
- 各作業ブランチは専用ディレクトリにチェックアウトする
  (例: `<repo>` の隣に `<repo>-<branch>/` を置く、もしくはコンシューマ側
  リポジトリの `external/...` 配下に worktree を貼る)
- 作業終了時は worktree を残してよい (削除する場合は `git worktree remove`)

### 6.2 なぜ？

同一リポジトリに対して複数のセッション・プロセス (別 Claude Code セッション、
スケジュール実行、エディタの自動操作、CI フック等) が同時に動くことがある。
メインチェックアウトでブランチを切り替えると、以下の事故が起こりうる:

- 別プロセスが checkout した結果、自分が編集中のファイルが消失する
- 自分のコミットが意図しない別ブランチに乗る (HEAD が動いた状態でコミットされる)
- 作業途中のステージが他プロセスにより破棄される

worktree は各ブランチに独立した作業ツリーを与えるため、上記の競合が
構造的に発生しない。

### 6.3 操作例

```bash
# ブランチ用 worktree を作成
git -C <repo> worktree add <別パス> <branch名>

# 既存ブランチを別パスに展開
git -C <repo> worktree add ../my-repo-feature feature/x

# ergo のモジュールブランチをコンシューマアプリ側に取り込む例
git -C ../ergo worktree add external/ergo/inspector module/inspector

# 一覧
git -C <repo> worktree list

# 後片付け (作業ツリー削除)
git -C <repo> worktree remove <別パス>
```

### 6.4 Claude / 自動化エージェントへの適用

- ブランチ操作 (`git checkout <branch>`) は **メインチェックアウト上では行わない**
- 新ブランチ作成時もまず main を派生させた worktree を作る
- 既に worktree がある場合は新規に作らず再利用する
- リリース集約等、main を確定操作する場合のみメインチェックアウトを使う

### 6.5 GitHub はリリースバージョン管理に限定する

- **`main` のリリース更新は GitHub App 経由だけで行う。** 人・AI・PAT・
  通常の Git 認証による `main` への直 push は禁止する。
- **`main` 以外のブランチは push 禁止。** 開発・レビュー用の feat / fix /
  その他ブランチはローカルで管理し、GitHub へ push しない。
- **GitHub PR は禁止。PR は Revisor 経由で行う。** 開発途中の共有・レビュー・
  統合を GitHub のブランチや PR に依存させない。
- **GitHub はリリースバージョンの管理にだけ使用する。** GitHub App から
  `main` へ公開するときは、同じリリース変更にプロジェクト正本の
  バージョン更新を必ず含める。
- **メジャーバージョンアップと大きいマイナーバージョンアップでタグを打つ。**
  メジャータグのタイミングは人間が判断し、マイナータグのタイミングは AI が
  判断する。タグの公開も GitHub App 経由で行い、直 push しない。
- **GitHub CI / GitHub Actions の workflow は置かない。** lint / build /
  typecheck / test 等の検証はローカルで完了させ、検証済みのリリースだけを
  local main へ集約し、GitHub App から GitHub の `main` へ公開する。

## 7. シークレット・設定管理

ローカルで動かす環境統合系（サービス間連携・常駐ツール・dev 起動・自動化エージェント等）の
設定とシークレットの扱いを定める。

### 7.1 環境統合の設定はファイルで一元管理する

- 環境統合系の設定値（接続先 URL / port / 機能フラグ / cwd / ログ root /
  ポーリング間隔など、いわゆる「環境変数相当」の値）は、**起動のたびに環境変数を
  手で渡す運用に依存せず、リポジトリ管理下の設定ファイルで宣言・一元管理する。**
  - 非シークレットの統合設定は **コミットしてよい**（再現性・差分追跡・レビュー可能性のため）。
  - 単一の loader を通して読み込む。環境変数による override は許容するが、**既定値はファイル**。
- 「手元だけ env を立てれば動く」状態を残さない。新しい環境変数を増やしたら、
  設定ファイル（と必要なら `.env.example` 相当のテンプレ）に必ず反映する。

### 7.2 シークレット・トークンは平文保存しない（salt / 暗号化）

- API キー / アクセストークン / `client_secret` / パスワード等のシークレットは、
  **平文でファイル・DB・ログ・設定ファイルに保存しない。**
- 自サービスが受け取って永続化するシークレット（ユーザートークン等）は:
  - 検証だけでよいもの → **salt 付きハッシュ**（bcrypt / scrypt / argon2。復号不可）。
  - 後で復号が必要なもの → **暗号化**（AEAD + 鍵は本体と分離して管理）。
- 設定ファイル（7.1）にシークレットを直書きしない。シークレットは別経路
  （`@cernere/env-cli` + Infisical / OS キーチェーン / 起動時の env 注入）で渡し、
  設定ファイルには **参照名のみ** を置く。
- 自己発行のランダムトークン（例: loopback 用の spawn token）も、ファイル保存するなら
  最小権限 (`0600`) + `.gitignore` を必須とし、長期保存・横展開する場合はハッシュ化を検討する。
- 認証関連トークン (JWT / OAuth refresh token 等) の責務は Cernere に集約する（§5・§1 と整合）。

### 7.3 なぜ？

- 設定をファイル化すると再現性・レビュー可能性・差分追跡が得られ、
  「環境依存で手元だけ動く」事故を構造的に防げる。
- 平文シークレットはリポ流出・ログ漏洩・バックアップ流出で即被害になる。
  salt 付きハッシュ／暗号化なら、漏洩しても被害を限定できる。
- 参照: `FORMAT_AUTH.md`「シークレット管理」（`client_id` / `client_secret` は env +
  `@cernere/env-cli` + Infisical で管理）。
