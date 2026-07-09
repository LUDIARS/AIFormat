# HARNESS CI チェック

[`HARNESS.md`](../HARNESS.md) の「CI ゲートで落とせる」ルールを、記憶ではなく
**機械が決定的に落とす**ためのスクリプト群。マージ前に走らせて違反を fail させる。

## チェック一覧

| スクリプト | 対象ルール | 内容 |
|-----------|-----------|------|
| `check-migrations.mjs` | HARNESS §2.3 / RULE.md §2 | `migrations/**/*.sql` の `DROP TABLE` / `DROP COLUMN` / `ALTER ... TYPE` / 番号重複 |
| `check-personal-data.mjs` | HARNESS §2.3 / RULE.md §5 | schema/migration SQL の個人データ列 (email/display_name/password_hash/token 等)。汎用語の `name`/`role` は誤検出源のため対象外。FK の `*_id` は許可 |
| `check-spec-structure.mjs` | HARNESS §2.3 / FORMAT_SPEC.md §1 | `spec/` 直下の非正規分類フォルダ (`usage/` 等) / 分類外ファイル / `spec/data/` を巻き込む無アンカー `.gitignore data/` を検出。**分類の欠落 (充実度) は該当性の判断を伴うため落とさない** (レビュー領分) |
| `check-latest-json.mjs` | REVIEW.md 成果物の配置と latest.json | `review/<YYYY-MM-DD>/latest.json` のスキーマ (必須フィールド / style・評価値の値域 / date とディレクトリ名の一致 / 件数の非負整数)。`format_version` >= 2 では **scores キーを `scores-keys.json` (正本) と順序込みで突合**する。2026-07-09 より前の日付ディレクトリは legacy として**検査対象外** (既存リポへの遡及適用で過去成果物を後から赤くしないため)。スタイル判定そのものの妥当性はレビュー領分 (prompt/REVIEW_FULL.md Phase 0) |
| `harness-check.mjs` | 上記の umbrella | 全チェックを一括実行。1 件でも違反で exit 1 |

> 新しい機械チェックの設計 (CI ゲート / Anatomia 計装の振り分け・検知ロジック・共通 IF) は
> [`script_design/`](../script_design/) にまとめる。実装済みになったらここへ移記する。

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

## 新規リポの spec/ 雛形 (scaffold-spec)

`check-spec-structure` が「構造の番人」なら、`scaffold-spec.mjs` は「最初に正しい形を撒く」側。
新規リポを作ったら一度走らせると、FORMAT_SPEC.md 準拠の spec/ 雛形と正しい `.gitignore` が入る。

```bash
node /path/to/AIFormat/scripts/scaffold-spec.mjs .        # spec/ 雛形を撒く
node /path/to/AIFormat/scripts/scaffold-spec.mjs . --dry  # 予定だけ表示
```

やること (すべて冪等・既存ファイルは温存):

- `spec/{data,feature,interface,setup,test}/README.md` に分類ガイドを置く
  (`plan/` は実装の都度作る作業ドキュメントなので雛形には含めない)
- `spec/README.md` に索引を置く
- `.gitignore` の無アンカー `data/` を `/data/` にアンカー
  (これをしないと `spec/data/*` が silently untracked になる。2026-06-19 に
  Ostiarius / EducationLab / Canalis で実害)

> 背景: 2026-06-19 の新規 6 リポ (Lapilli/Anatomia/Ostiarius/Fundamentum/EducationLab/Canalis)
> 全件で「DESIGN.md は厚いのに spec/ 分類に落ちていない」穴が出た。設計を書く力ではなく
> **最初の形** が欠けていたので、雛形 (scaffold) と番人 (check) の両輪で塞ぐ。

## 設計メモ

- これらは HARNESS の「強制できるものは記憶に頼らない」原則の実装。
  判断を挟まず決定的に落とせるルールだけを CI 化している。
- SRP / コア・モジュール分離 / フルセット No-MVP のような**判断系**は CI 化せず、
  HARNESS / レビュー / メモリで担保する (別軸)。
- コマンドレベルの地雷 (`git reset --hard` / 稼働中 SQLite の cp 等) は CI ではなく
  harness の **PreToolUse フック** (`.claude/hooks/harness-guard.mjs`) で着手前に止める。
