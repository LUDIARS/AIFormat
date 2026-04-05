---
description: DBマイグレーションの実装ルール。新規マイグレーション作成時・マイグレーションランナー実装時に適用。
globs: ["**/migrations/**", "**/migrate.ts", "**/migrate.rs"]
---

# DB マイグレーションルール

## マイグレーションファイル

- `migrations/` ディレクトリに連番 SQL ファイルで管理
- ファイル名: `{番号}_{説明}.sql` (例: `001_initial.sql`, `010_managed_projects.sql`)
- 番号は重複させない（過去に 003 の重複でエラーが発生した実績あり）

## マイグレーションランナーの実装要件

### 冪等性

各 SQL ステートメントはセミコロンで分割し個別実行する。以下の PostgreSQL エラーコードはスキップして続行する:

| コード | 意味 | 発生例 |
|--------|------|--------|
| `42P07` | relation already exists | CREATE TABLE が既存テーブルと衝突 |
| `42701` | column already exists | ALTER TABLE ADD COLUMN が既存カラムと衝突 |
| `42710` | object already exists | CREATE INDEX 等が既存オブジェクトと衝突 |
| `42P01` | relation does not exist | CREATE TABLE がスキップされた後の CREATE INDEX |
| `42704` | type does not exist | 型参照の不整合 |
| `23505` | duplicate key | マイグレーション記録の重複 |

### バージョン管理

- `_migrations` テーブルでバージョン (ファイル名から `.sql` を除いたもの) を記録
- 適用済みバージョンはスキップ

### 他のマイグレーションツールとの互換

- `_sqlx_migrations` (Rust/sqlx) が存在する場合、適用済みバージョンを `_migrations` にインポートして既存 SQL の再実行を防ぐ

## SQL の書き方

### テーブル作成

```sql
CREATE TABLE IF NOT EXISTS my_table (
    id UUID PRIMARY KEY,
    ...
);
CREATE INDEX IF NOT EXISTS idx_my_table_col ON my_table (col);
```

### カラム追加

```sql
ALTER TABLE my_table ADD COLUMN IF NOT EXISTS new_col TEXT;
```

### やってはいけないこと

- `DROP TABLE` — テーブルは削除しない（論理削除 `is_active = false` を使う）
- `DROP COLUMN` — カラムは削除しない（データ保全）
- `ALTER COLUMN ... TYPE` — 型変更は新カラム追加で対応
- マイグレーション番号の再利用・重複
