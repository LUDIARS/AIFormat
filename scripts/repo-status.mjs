#!/usr/bin/env node
/**
 * repo-status — LUDIARS 全リポジトリの未コミット変更検知ツール
 *
 * Usage:
 *   node repo-status.mjs              # 変更のあるリポジトリのみ表示
 *   node repo-status.mjs --all        # 全リポジトリを表示 (clean 含む)
 *   node repo-status.mjs -v           # 変更ファイル一覧も表示
 *   node repo-status.mjs --json       # JSON 出力
 */

import { execSync } from "node:child_process";
import { readdirSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const BASE_DIR = process.env.LUDIARS_BASE || "<workspace-root>";

const rawArgs = process.argv.slice(2);
const SHOW_ALL = rawArgs.includes("--all");
const VERBOSE = rawArgs.includes("-v") || rawArgs.includes("--verbose");
const JSON_OUT = rawArgs.includes("--json");

function git(dir, cmd) {
  try {
    return execSync(`git ${cmd}`, {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

function isRepo(dir) {
  return existsSync(join(dir, ".git"));
}

function analyzeRepo(dir) {
  const name = basename(dir);
  const branch = git(dir, "branch --show-current") || "(detached)";
  const porcelain = git(dir, "status --porcelain");
  const lines = porcelain ? porcelain.split("\n").filter(Boolean) : [];

  let modified = 0;
  let untracked = 0;
  let staged = 0;
  const files = { modified: [], untracked: [], staged: [] };

  for (const line of lines) {
    const index = line[0];
    const work = line[1];
    const path = line.slice(3);

    if (index !== " " && index !== "?") {
      staged++;
      files.staged.push(path);
    }
    if (work === "M" || work === "D") {
      modified++;
      files.modified.push(path);
    }
    if (index === "?") {
      untracked++;
      files.untracked.push(path);
    }
  }

  // Check if branch is behind/ahead of remote
  const tracking = git(dir, "rev-parse --abbrev-ref @{u}");
  let ahead = 0;
  let behind = 0;
  if (tracking) {
    const ab = git(dir, `rev-list --left-right --count ${tracking}...HEAD`);
    const parts = ab.split(/\s+/);
    if (parts.length === 2) {
      behind = parseInt(parts[0], 10) || 0;
      ahead = parseInt(parts[1], 10) || 0;
    }
  }

  const clean = modified === 0 && untracked === 0 && staged === 0;

  return {
    name,
    branch,
    modified,
    untracked,
    staged,
    ahead,
    behind,
    clean,
    files,
  };
}

// ── Main ──────────────────────────────────────────────────

const repos = [];
for (const entry of readdirSync(BASE_DIR)) {
  const full = join(BASE_DIR, entry);
  try {
    if (!statSync(full).isDirectory()) continue;
    if (!isRepo(full)) continue;
    repos.push(analyzeRepo(full));
  } catch {
    // skip
  }
}

repos.sort((a, b) => {
  // Dirty repos first
  if (a.clean !== b.clean) return a.clean ? 1 : -1;
  return a.name.localeCompare(b.name);
});

if (JSON_OUT) {
  console.log(JSON.stringify(repos, null, 2));
  process.exit(0);
}

// ── Terminal output ───────────────────────────────────────

const dirty = repos.filter((r) => !r.clean);
const cleanCount = repos.length - dirty.length;

console.log(
  `\n  LUDIARS Repo Status — ${repos.length} repos, ${dirty.length} dirty, ${cleanCount} clean\n`
);

const display = SHOW_ALL ? repos : dirty;

if (display.length === 0) {
  console.log("  All repositories are clean.\n");
  process.exit(0);
}

for (const r of display) {
  const flags = [];
  if (r.staged > 0)    flags.push(`\x1b[32mS:${r.staged}\x1b[0m`);
  if (r.modified > 0)  flags.push(`\x1b[33mM:${r.modified}\x1b[0m`);
  if (r.untracked > 0) flags.push(`\x1b[31mU:${r.untracked}\x1b[0m`);
  if (r.ahead > 0)     flags.push(`\x1b[36m↑${r.ahead}\x1b[0m`);
  if (r.behind > 0)    flags.push(`\x1b[35m↓${r.behind}\x1b[0m`);

  const status = r.clean
    ? "\x1b[32mclean\x1b[0m"
    : flags.join(" ");

  const branchColor = r.branch === "main" ? "" : "\x1b[33m";
  const branchReset = r.branch === "main" ? "" : "\x1b[0m";

  console.log(
    `  ${r.name.padEnd(22)} ${branchColor}${r.branch.padEnd(30)}${branchReset} ${status}`
  );

  if (VERBOSE && !r.clean) {
    for (const f of r.files.staged.slice(0, 10))    console.log(`    \x1b[32m+ ${f}\x1b[0m`);
    for (const f of r.files.modified.slice(0, 10))   console.log(`    \x1b[33m~ ${f}\x1b[0m`);
    for (const f of r.files.untracked.slice(0, 10))  console.log(`    \x1b[31m? ${f}\x1b[0m`);
    const total = r.files.staged.length + r.files.modified.length + r.files.untracked.length;
    const shown = Math.min(r.files.staged.length, 10) + Math.min(r.files.modified.length, 10) + Math.min(r.files.untracked.length, 10);
    if (shown < total) console.log(`    \x1b[90m... and ${total - shown} more\x1b[0m`);
  }
}

console.log("");
