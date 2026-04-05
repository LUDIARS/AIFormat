#!/bin/bash
# AIFormat の .claude/ skills をターゲットプロジェクトに同期する
#
# Usage:
#   ./sync.sh                     # 全プロジェクトに同期
#   ./sync.sh /path/to/project    # 特定プロジェクトに同期
#
# AIFormat の skills/ をプロジェクトの .claude/skills/ にコピーし、
# RULE*.md / FORMAT*.md を CLAUDE.md に include 参照として追記する。

set -euo pipefail

AIFORMAT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="$AIFORMAT_DIR/.claude/skills"

# ターゲットプロジェクト一覧 (引数がなければデフォルト)
if [ $# -gt 0 ]; then
  TARGETS=("$@")
else
  PARENT="$(dirname "$AIFORMAT_DIR")"
  TARGETS=(
    "$PARENT/Cernere"
    "$PARENT/Schedula"
    "$PARENT/ars"
  )
fi

for TARGET in "${TARGETS[@]}"; do
  if [ ! -d "$TARGET" ]; then
    echo "[skip] $TARGET (not found)"
    continue
  fi

  PROJECT_NAME="$(basename "$TARGET")"
  echo "[sync] $PROJECT_NAME"

  # .claude/skills/ にスキルをコピー
  mkdir -p "$TARGET/.claude/skills"

  if [ -d "$SKILLS_DIR" ]; then
    for skill in "$SKILLS_DIR"/*.md; do
      [ -f "$skill" ] || continue
      FILENAME="$(basename "$skill")"
      # aiformat- プレフィックスを付けてコピー（プロジェクト固有スキルと区別）
      cp "$skill" "$TARGET/.claude/skills/aiformat-$FILENAME"
    done
    echo "  Skills: $(ls "$SKILLS_DIR"/*.md 2>/dev/null | wc -l) files copied"
  fi

  # CLAUDE.md にルールファイルの内容を埋め込む
  CLAUDE_MD="$TARGET/CLAUDE.md"

  # 既存の AIFormat セクションを除去
  if [ -f "$CLAUDE_MD" ]; then
    sed -i '/<!-- BEGIN AIFormat -->/,/<!-- END AIFormat -->/d' "$CLAUDE_MD"
  fi

  # AIFormat セクションを追記
  {
    echo ""
    echo "<!-- BEGIN AIFormat -->"
    echo "# AIFormat Rules"
    echo ""
    for rule in "$AIFORMAT_DIR"/RULE*.md; do
      [ -f "$rule" ] || continue
      echo "## $(basename "$rule" .md)"
      echo ""
      cat "$rule"
      echo ""
    done
    echo "<!-- END AIFormat -->"
  } >> "$CLAUDE_MD"

  echo "  CLAUDE.md: AIFormat rules appended"
  echo ""
done

echo "Done."
