---
description: Drizzle ORM の使い方ルール。DB スキーマ作成・リポジトリ層実装・マイグレーション・Drizzle Studio 使用時に適用。
globs: ["**/db/schema.ts", "**/db/repository.ts", "**/drizzle.config.ts", "**/db/connection.ts"]
---

# Drizzle ORM ルール

LUDIARS の全 TypeScript サービスは DB アクセスに **Drizzle ORM** を使用する。

## スキーマ定義

`src/db/schema.ts` に `pgTable` で定義する。

```typescript
import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  settings: jsonb('settings').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

## リポジトリ層

- **ルートハンドラから直接 Drizzle を呼ばない**。必ず `src/db/repository.ts` のリポジトリ関数を経由する
- 型は `typeof table.$inferSelect` / `$inferInsert` で推論する

```typescript
export const projectRepo = {
  async findById(id: string) {
    const [row] = await db.select().from(schema.projects).where(eq(schema.projects.id, id));
    return row;
  },
  async create(data: typeof schema.projects.$inferInsert) {
    const [row] = await db.insert(schema.projects).values(data).returning();
    return row;
  },
};
```

## GIN インデックス等の制約

Drizzle の `index()` API で表現できないもの（GIN, tsvector 等）は `migrations/` の SQL で定義する。

```sql
CREATE INDEX IF NOT EXISTS idx_assets_tags ON assets USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_assets_name_search ON assets USING GIN(to_tsvector('simple', name));
```

## Drizzle Studio (DB 閲覧)

```bash
# Infra リポジトリから全 DB を閲覧
cd infra && npm run studio:cernere
cd infra && npm run studio:curare
cd infra && npm run studio:schedula

# または各サービスから
npx drizzle-kit studio
```

## Drizzle Kit (マイグレーション)

```bash
npx drizzle-kit generate   # スキーマ差分から SQL 生成
npx drizzle-kit migrate    # SQL 適用
npx drizzle-kit push       # スキーマを直接 DB に同期
```
