#!/bin/bash
# LUDIARS 全リポジトリ PR ステータス確認スクリプト
# Usage: bash ludiars-pr.sh [base_dir]

set -euo pipefail

BASE_DIR="${1:-<workspace-root>}"
TOTAL_PRS=0
TOTAL_NEEDS_ACTION=0

echo "## LUDIARS PR ステータス"
echo ""

# Collect repos
repos=()
for d in "$BASE_DIR"/*/; do
  [ -d "$d/.git" ] || continue
  remote=$(git -C "$d" remote get-url origin 2>/dev/null || true)
  if echo "$remote" | grep -qi "LUDIARS"; then
    repos+=("$d")
  fi
done

# Sort by repo name
IFS=$'\n' repos=($(for r in "${repos[@]}"; do echo "$r"; done | sort)); unset IFS

declare -A repo_pr_counts
declare -A repo_needs_action

for d in "${repos[@]}"; do
  name=$(basename "$d")

  # Get open PRs
  prs=$(gh pr list --repo "LUDIARS/$name" --state open \
    --json number,title,headRefName,updatedAt,author,reviewDecision 2>/dev/null || echo "[]")

  count=$(echo "$prs" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

  if [ "$count" = "0" ]; then
    echo "### $name (0件)"
    echo "（オープンPRなし）"
    echo ""
    continue
  fi

  needs_action=0
  echo "### $name (${count}件)"
  echo ""
  echo "| PR | タイトル | ブランチ | 作成者 | レビュー |"
  echo "|----|---------|---------|--------|---------|"

  echo "$prs" | python3 -c "
import sys, json
from datetime import datetime, timezone

prs = json.load(sys.stdin)
for pr in sorted(prs, key=lambda x: x['number']):
    num = pr['number']
    title = pr['title'][:50]
    branch = pr['headRefName']
    author = pr.get('author', {}).get('login', '?')
    review = pr.get('reviewDecision', '') or 'PENDING'
    mark = ' ⚠️' if review == 'CHANGES_REQUESTED' else ''
    print(f'| #{num} | {title} | {branch} | {author} | {review}{mark} |')
" 2>/dev/null

  needs_action=$(echo "$prs" | python3 -c "
import sys, json
prs = json.load(sys.stdin)
print(sum(1 for p in prs if p.get('reviewDecision') == 'CHANGES_REQUESTED'))
" 2>/dev/null || echo "0")

  echo ""

  TOTAL_PRS=$((TOTAL_PRS + count))
  TOTAL_NEEDS_ACTION=$((TOTAL_NEEDS_ACTION + needs_action))
done

echo "---"
echo ""
echo "### サマリ"
echo "- 対象リポジトリ: ${#repos[@]}件"
echo "- オープンPR合計: ${TOTAL_PRS}件"
echo "- 要対応 (CHANGES_REQUESTED): ${TOTAL_NEEDS_ACTION}件"
