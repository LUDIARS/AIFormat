#!/bin/bash
# AIFormat の .claude/ skills とルールをカレントワーキングディレクトリに同期する
#
# Usage:
#   # カレントディレクトリに同期 (どのプロジェクトからでも実行可能)
#   bash /path/to/AIFormat/sync-local.sh
#
#   # または AIFormat ディレクトリから
#   ./sync-local.sh /path/to/target
#
# 想定構成:
#   <workspace-root>/          ← 上位階層
#   ├── AIFormat/              ← このスクリプトの場所
#   ├── Cernere/               ← ターゲットプロジェクト
#   ├── Schedula/
#   └── ars/

set -euo pipefail

AIFORMAT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-$(pwd)}"
TARGET="$(cd "$TARGET" && pwd)"

SKILLS_DIR="$AIFORMAT_DIR/.claude/skills"
PROJECT_NAME="$(basename "$TARGET")"

echo "AIFormat sync → $PROJECT_NAME ($TARGET)"

# .claude/skills/ にスキルをコピー (aiformat- プレフィックス)
mkdir -p "$TARGET/.claude/skills"

if [ -d "$SKILLS_DIR" ]; then
  count=0
  for skill in "$SKILLS_DIR"/*.md; do
    [ -f "$skill" ] || continue
    FILENAME="$(basename "$skill")"
    cp "$skill" "$TARGET/.claude/skills/aiformat-$FILENAME"
    count=$((count + 1))
  done
  echo "  Skills: $count files → .claude/skills/aiformat-*.md"
fi

# .claude/commands/ にコマンドをコピー (aiformat- プレフィックス)
COMMANDS_DIR="$AIFORMAT_DIR/.claude/commands"
mkdir -p "$TARGET/.claude/commands"

if [ -d "$COMMANDS_DIR" ]; then
  cmd_count=0
  for cmd in "$COMMANDS_DIR"/*.md; do
    [ -f "$cmd" ] || continue
    FILENAME="$(basename "$cmd")"
    cp "$cmd" "$TARGET/.claude/commands/aiformat-$FILENAME"
    cmd_count=$((cmd_count + 1))
  done
  echo "  Commands: $cmd_count files → .claude/commands/aiformat-*.md"
fi

# CLAUDE.md にルールファイルを埋め込む
CLAUDE_MD="$TARGET/CLAUDE.md"

# 既存の AIFormat セクションを除去
if [ -f "$CLAUDE_MD" ]; then
  # sed でマーカー間を削除
  sed -i '/<!-- BEGIN AIFormat -->/,/<!-- END AIFormat -->/d' "$CLAUDE_MD"
else
  touch "$CLAUDE_MD"
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

echo "  CLAUDE.md: AIFormat rules embedded"
echo "Done."
