# HARNESS CI チェック

[`HARNESS.md`](../HARNESS.md) の「CI ゲートで落とせる」ルールを、記憶ではなく
**機械が決定的に落とす**ためのスクリプト群。マージ前に走らせて違反を fail させる。

## チェック一覧

| スクリプト | 対象ルール | 内容 |
|-----------|-----------|------|
| `check-migrations.mjs` | HARNESS §2.3 / RULE.md §2 | `migrations/**/*.sql` の `DROP TABLE` / `DROP COLUMN` / `ALTER ... TYPE` / 番号重複 |
| `check-personal-data.mjs` | HARNESS §2.3 / RULE.md §5 | schema/migration SQL の個人データ列 (email/display_name/password_hash/token 等)。汎用語の `name`/`role` は誤検出源のため対象外。FK の `*_id` は許可 |
| `harness-check.mjs` | 上記の umbrella | 全チェックを一括実行。1 件でも違反で exit 1 |

## ローカル実行

```bash
# リポジトリ直下で
node /path/to/AIFormat/scripts/harness-check.mjs .

# 個別に
node /path/to/AIFormat/scripts/check-migrations.mjs .
node /path/to/AIFormat/scripts/check-personal-data.mjs . --json
```

exit code: `0` = OK / `1` = 違反あり。

## CI へ組み込む (再利用可能ワークフロー)

各リポの `.github/workflows/*.yml` に 3 行足すだけ:

```yaml
jobs:
  harness:
    uses: LUDIARS/AIFormat/.github/workflows/harness-checks.yml@main
```

private リポを横断 checkout する場合は `repo:read` の PAT を渡す:

```yaml
jobs:
  harness:
    uses: LUDIARS/AIFormat/.github/workflows/harness-checks.yml@main
    secrets:
      aiformat_token: ${{ secrets.AIFORMAT_TOKEN }}
```

## 誤検出の抑制

`check-personal-data` は、各サービス固有で個人データではない列
(例: Schedula の `major`) を誤検知しうる。リポ直下に
`.harness-allow-personal-data.json` を置いて抑制する:

```json
{
  "columns": ["major", "nickname"],
  "files": ["spec/data/legacy.sql"]
}
```

Cernere 自身は個人データの正本のため自動でスキップされる。

## 設計メモ

- これらは HARNESS の「強制できるものは記憶に頼らない」原則の実装。
  判断を挟まず決定的に落とせるルールだけを CI 化している。
- SRP / コア・モジュール分離 / フルセット No-MVP のような**判断系**は CI 化せず、
  HARNESS / レビュー / メモリで担保する (別軸)。
- コマンドレベルの地雷 (`git reset --hard` / 稼働中 SQLite の cp 等) は CI ではなく
  harness の **PreToolUse フック** (`.claude/hooks/harness-guard.mjs`) で着手前に止める。
