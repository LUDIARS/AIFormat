# Cernere 認証実装フォーマット

全 LUDIARS サービスは本フォーマットに従い Cernere 認証を実装する。

- Cernere リポジトリ: https://github.com/LUDIARS/Cernere
- 基盤設計ルール: [RULE.md](./RULE.md)

---

## 1. サービス間接続（プロジェクト認証）

サービス同士の接続には **Tool Client 認証（`client_credentials` グラント）** を使用する。ユーザーセッションではなく、サービス固有の認証情報で JWT を取得するパターンである。

### 1.1 Tool Client の発行

認証済みユーザーが Cernere 管理画面または API からサービス用の Tool Client を作成する。

```
POST /api/auth/tools
Authorization: Bearer <user_access_token>
Content-Type: application/json

{
  "name": "my-service",
  "scopes": ["read", "write"]
}
```

レスポンス（**clientSecret は作成時のみ返却される。再取得不可**）:

```json
{
  "client": {
    "id": "uuid",
    "name": "my-service",
    "clientId": "tool_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "ownerUserId": "uuid",
    "scopes": ["read", "write"],
    "isActive": true,
    "lastUsedAt": null,
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z"
  },
  "clientSecret": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

### 1.2 サービス認証フロー

サービス起動時またはトークン期限切れ時に `client_credentials` でアクセストークンを取得する。

```
POST /api/auth/login
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "tool_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "client_secret": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

レスポンス:

```json
{
  "tokenType": "tool",
  "accessToken": "<jwt>",
  "expiresIn": 3600,
  "client": { ... }
}
```

### 1.3 Tool JWT クレーム構造

```typescript
{
  sub: string;          // tool_client.id
  owner: string;        // 作成者の user_id
  scopes: string[];     // 許可スコープ
  iat: number;          // 発行日時 (Unix timestamp)
  exp: number;          // 有効期限 (Unix timestamp, 発行から60分)
}
```

### 1.4 プロジェクト認証の実装要件

| 要件 | 詳細 |
|------|------|
| シークレット管理 | `client_id` / `client_secret` は環境変数で管理。`@cernere/env-cli` + Infisical を推奨 |
| トークンの有効期限 | 60 分。期限切れ前に再取得する |
| リトライ | 認証失敗時は指数バックオフで再試行（最大 3 回） |
| スコープ検証 | 受信側サービスは JWT の `scopes` を検証し、要求された操作が許可範囲内か確認する |
| 無効化 | 不要になった Tool Client は `DELETE /api/auth/tools/:id` で削除する |

### 1.5 サービス間接続の実装例

```typescript
// ── サービス認証クライアント ──────────────────────
class ServiceAuth {
  private accessToken: string | null = null;
  private expiresAt: number = 0;

  constructor(
    private cernereUrl: string,
    private clientId: string,
    private clientSecret: string,
  ) {}

  async getToken(): Promise<string> {
    // 有効期限の 5 分前に再取得
    if (this.accessToken && Date.now() < this.expiresAt - 300_000) {
      return this.accessToken;
    }

    const res = await fetch(`${this.cernereUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!res.ok) throw new Error(`Auth failed: ${res.status}`);

    const data = await res.json();
    this.accessToken = data.accessToken;
    this.expiresAt = Date.now() + data.expiresIn * 1000;
    return this.accessToken!;
  }

  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getToken();
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  }
}

// ── 使用例 ──────────────────────────────────────
const serviceAuth = new ServiceAuth(
  process.env.CERNERE_URL!,
  process.env.TOOL_CLIENT_ID!,
  process.env.TOOL_CLIENT_SECRET!,
);

const res = await serviceAuth.fetch("http://other-service/api/data");
```

---

## 2. フロントエンド認証（JWT）

フロントエンドからの認証は JWT ベースのトークン管理で行う。

### 2.1 トークン管理

```typescript
// ── トークンの保存・取得・削除 ────────────────────
function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem("accessToken", accessToken);
  localStorage.setItem("refreshToken", refreshToken);
}

function clearTokens() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("user");
}

function getAccessToken(): string | null {
  return localStorage.getItem("accessToken");
}

function getRefreshToken(): string | null {
  return localStorage.getItem("refreshToken");
}
```

### 2.2 ユーザー JWT クレーム構造

```typescript
{
  sub: string;    // user.id
  role: string;   // "admin" | "general"
  iat: number;    // 発行日時 (Unix timestamp)
  exp: number;    // 有効期限 (Unix timestamp, 発行から60分)
}
```

| トークン | 有効期限 | 用途 |
|----------|----------|------|
| アクセストークン | 60 分 | API リクエストの認証 |
| リフレッシュトークン | 30 日 | アクセストークンの再発行 |

### 2.3 API リクエスト（自動リフレッシュ付き）

すべての認証付き API リクエストは以下のパターンに従う。

```typescript
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  const token = getAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res = await fetch(path, { ...options, headers });

  // 401 → リフレッシュトークンで再取得を試行
  if (res.status === 401 && getRefreshToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${getAccessToken()}`;
      res = await fetch(path, { ...options, headers });
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      clearTokens();
      return false;
    }
    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}
```

### 2.4 認証 API エンドポイント

| 操作 | メソッド | エンドポイント | ボディ |
|------|----------|---------------|--------|
| 登録 | POST | `/api/auth/register` | `{ name, email, password }` |
| ログイン | POST | `/api/auth/login` | `{ email, password }` |
| ログアウト | POST | `/api/auth/logout` | `{ refreshToken }` |
| トークンリフレッシュ | POST | `/api/auth/refresh` | `{ refreshToken }` |
| 現在のユーザー | GET | `/api/auth/me` | — |

**レスポンス形式（登録・ログイン成功時）:**

```json
{
  "user": { "id": "...", "displayName": "...", "email": "...", "role": "..." },
  "accessToken": "<jwt>",
  "refreshToken": "<refresh_token>"
}
```

### 2.5 OAuth フロー

#### Google OAuth

```typescript
// 1. 認証ページへリダイレクト
window.location.href = "/auth/google/login";

// 2. コールバック後、URL パラメータからトークンを取得
const params = new URLSearchParams(window.location.search);
const accessToken = params.get("accessToken");
const refreshToken = params.get("refreshToken");

if (accessToken && refreshToken) {
  setTokens(accessToken, refreshToken);
  window.history.replaceState({}, "", window.location.pathname);
}
```

#### GitHub OAuth

```typescript
window.location.href = "/auth/github/login";
// コールバック処理は Google OAuth と同一
```

#### アカウントリンク（既存アカウントへの OAuth 連携追加）

```typescript
// GitHub リンク
window.location.href = "/auth/link/github";
// Google リンク
window.location.href = "/auth/link/google";
// 連携解除
await request("/api/auth/unlink", {
  method: "POST",
  body: JSON.stringify({ provider: "github" }),
});
```

### 2.6 MFA（多要素認証）

ログイン時に MFA が有効なユーザーは、通常のトークンの代わりに MFA チャレンジが返される。

**MFA チャレンジレスポンス:**

```json
{
  "mfaRequired": true,
  "mfaToken": "<temporary_token>",
  "mfaMethods": ["totp", "sms", "email"]
}
```

**MFA 検証フロー:**

```typescript
// 1. ログインで MFA チャレンジを受信
const result = await auth.login({ email, password });
if (result.mfaRequired) {
  // 2. SMS / Email の場合はコード送信を要求
  await fetch("/api/auth/mfa/send-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mfaToken: result.mfaToken, method: "sms" }),
  });

  // 3. ユーザーが入力したコードで検証
  const verified = await fetch("/api/auth/mfa/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mfaToken: result.mfaToken,
      method: "sms",
      code: "123456",
    }),
  }).then((r) => r.json());

  // 4. 検証成功 → 通常のトークンレスポンス
  setTokens(verified.accessToken, verified.refreshToken);
}
```

**MFA 管理 API:**

| 操作 | メソッド | エンドポイント |
|------|----------|---------------|
| MFA ステータス確認 | GET | `/api/auth/mfa/status` |
| TOTP セットアップ | POST | `/api/auth/mfa/totp/setup` |
| TOTP 有効化 | POST | `/api/auth/mfa/totp/enable` |
| TOTP 無効化 | POST | `/api/auth/mfa/totp/disable` |
| SMS セットアップ | POST | `/api/auth/mfa/sms/setup` |
| SMS 電話番号検証 | POST | `/api/auth/mfa/sms/verify-phone` |
| SMS MFA 有効化 | POST | `/api/auth/mfa/sms/enable` |
| SMS MFA 無効化 | POST | `/api/auth/mfa/sms/disable` |
| Email MFA 有効化 | POST | `/api/auth/mfa/email/enable` |
| Email MFA 無効化 | POST | `/api/auth/mfa/email/disable` |

### 2.7 React 実装パターン（AuthContext）

```typescript
// ── AuthContext の提供する機能 ────────────────────
interface AuthContextType {
  user: User | null;
  loading: boolean;
  mfaChallenge: MfaChallenge | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  mfaSendCode: (method: string) => Promise<void>;
  mfaVerify: (method: string, code: string) => Promise<void>;
  mfaCancelChallenge: () => void;
  googleAuthUrl: string;
  githubAuthUrl: string;
  linkGitHubUrl: string;
  linkGoogleUrl: string;
}
```

**初期化時の処理:**

1. `localStorage` から保存済みユーザー情報を復元
2. URL パラメータから OAuth コールバックのトークンを取得
3. `/api/auth/me` でユーザー情報を最新化
4. エラー時はユーザー状態をクリア

---

## 3. バックエンド認証委譲（`@cernere/id-cache`）

各サービスのバックエンドは Cernere に認証を委譲し、自プロジェクト側にユーザーテーブルを持たない。

### 3.1 インストール

```bash
npm install @cernere/id-cache hono jsonwebtoken
```

### 3.2 キャッシュクライアントの初期化

```typescript
import { createIdCache } from "@cernere/id-cache";

const idCache = createIdCache({
  idServiceUrl: process.env.CERNERE_URL!,
  jwtSecret: process.env.JWT_SECRET,       // ローカル検証で高速化（省略時は毎回 API コール）
  cacheTtlSeconds: 300,                    // キャッシュ TTL（デフォルト: 5分）
  maxCacheSize: 10000,                     // 最大エントリ数（デフォルト: 10000）
});
```

### 3.3 ミドルウェアの適用

```typescript
import { Hono } from "hono";
import { createIdCacheMiddleware } from "@cernere/id-cache";

const app = new Hono();

app.use("/api/*", createIdCacheMiddleware({
  idCache,
  jwtSecret: process.env.JWT_SECRET,
  isDev: process.env.NODE_ENV !== "production",
}));

app.get("/api/data", (c) => {
  const userId = c.get("userId");     // string
  const role = c.get("userRole");     // string
  const user = c.get("user");         // CachedUser

  if (userId === "anonymous") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return c.json({ userId, role });
});
```

### 3.4 認証フロー

```
クライアント                あなたのサービス              Cernere コア
    |                            |                           |
    | Authorization: Bearer xxx  |                           |
    | =========================> |                           |
    |                            | 1. JWT ローカル検証        |
    |                            |    (jwtSecret あり)       |
    |                            |                           |
    |                            | 2. キャッシュヒット?       |
    |                            | |- Yes -> ユーザー返却    |
    |                            | |- No                     |
    |                            |   POST /api/auth/verify   |
    |                            | =========================>|
    |                            | <=========================|
    |                            |   3. キャッシュ保存        |
    |                            |                           |
    | <===== レスポンス ======== |                           |
```

### 3.5 キャッシュの運用

```typescript
// 特定ユーザーのキャッシュ無効化（ロール変更時など）
idCache.invalidate(userId);

// 全キャッシュクリア
idCache.clear();

// 統計確認
const stats = idCache.stats();
// { size: number, hits: number, misses: number }
```

### 3.6 開発環境

開発環境（`NODE_ENV !== "production"`）では、Bearer トークンの代わりにヘッダーで認証情報を渡せる。

```bash
curl -H "X-User-Id: test-user-id" \
     -H "X-User-Role: admin" \
     http://localhost:3000/api/data
```

> **本番環境ではこの機能は無効化される。**

---

## 4. シークレット管理

### 4.1 `@cernere/env-cli` によるセットアップ

```bash
# Infisical 認証情報を設定
npx env-cli setup

# 接続テスト
npx env-cli test

# .env ファイル生成
npx env-cli env
```

### 4.2 必須環境変数

| 変数 | 用途 | 必須 |
|------|------|------|
| `CERNERE_URL` | Cernere コアサーバーの URL | はい |
| `JWT_SECRET` | JWT 署名シークレット（ローカル検証用） | 推奨 |
| `TOOL_CLIENT_ID` | サービス認証用 client_id | サービス間接続時 |
| `TOOL_CLIENT_SECRET` | サービス認証用 client_secret | サービス間接続時 |

---

## 5. 実装チェックリスト

### フロントエンド

- [ ] `localStorage` によるトークン管理（accessToken / refreshToken）
- [ ] `Authorization: Bearer <token>` ヘッダーの付与
- [ ] 401 レスポンス時の自動リフレッシュ
- [ ] リフレッシュ失敗時のトークンクリア・ログアウト
- [ ] OAuth コールバックの URL パラメータ処理
- [ ] MFA チャレンジの分岐処理（`mfaRequired` フラグ）

### バックエンド

- [ ] `@cernere/id-cache` ミドルウェアの適用
- [ ] `userId` / `userRole` のコンテキストからの取得
- [ ] `anonymous` ユーザーの拒否

### サービス間接続

- [ ] Tool Client の発行と `client_id` / `client_secret` の環境変数管理
- [ ] `client_credentials` による JWT 取得
- [ ] トークン有効期限の管理（60 分、5 分前に再取得）
- [ ] JWT の `scopes` 検証
