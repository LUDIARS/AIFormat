# LUDIARS PR 状況確認スキル

LUDIARS org 配下の全クローン済みリポジトリについて、オープン PR の状況を横断的に確認する。

## リポジトリ検出方法

`<workspace-root>/` 配下で `.git` を持ち、`origin` リモートが `LUDIARS` を含むディレクトリを対象とする。

```bash
for d in <workspace-root>/*/; do
  if [ -d "$d/.git" ]; then
    remote=$(git -C "$d" remote get-url origin 2>/dev/null)
    if echo "$remote" | grep -qi "LUDIARS"; then
      basename "$d"
    fi
  fi
done
```

## PR 取得方法

各リポジトリディレクトリで `gh pr list` を実行:

```bash
gh pr list --repo LUDIARS/{repo} --state open \
  --json number,title,headRefName,updatedAt,author,labels,reviewDecision
```

## 判定基準

| 状態 | 判定 |
|------|------|
| `APPROVED` | 対応不要（マージ可能） |
| `CHANGES_REQUESTED` | 要対応 ⚠️ |
| `REVIEW_REQUIRED` / 空 | レビュー待ち |

## 使用コマンド

`/ludiars-pr` コマンドから呼び出される。読み取り専用で、ファイル変更は行わない。
