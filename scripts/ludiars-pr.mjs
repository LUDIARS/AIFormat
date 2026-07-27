#!/usr/bin/env node
/**
 * ludiars-pr — LUDIARS 全リポジトリ PR ステータス確認
 *
 * Usage: node ludiars-pr.mjs [base_dir]
 * Requires: gh CLI
 */

import { execSync } from "node:child_process";
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

import { resolveWorkspaceRoot } from "./lib/workspace-root.mjs";

const BASE_DIR = resolveWorkspaceRoot(process.argv[2]);

function isLudiarsRepo(dir) {
  try {
    if (!existsSync(join(dir, ".git"))) return false;
    const remote = execSync(`git -C "${dir}" remote get-url origin`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return /LUDIARS/i.test(remote);
  } catch {
    return false;
  }
}

function getPRs(repoName) {
  try {
    const json = execSync(
      `gh pr list --repo LUDIARS/${repoName} --state open --json number,title,headRefName,updatedAt,author,reviewDecision`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Collect repos
const dirs = readdirSync(BASE_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => join(BASE_DIR, d.name))
  .filter(isLudiarsRepo);

console.log("## LUDIARS PR Status\n");

const results = [];
for (const dir of dirs) {
  const name = basename(dir);
  const prs = getPRs(name);
  if (prs === null) {
    console.error(`  [skip] ${name}: gh command failed`);
    continue;
  }
  results.push({ name, prs });
}

// Sort by PR count desc
results.sort((a, b) => b.prs.length - a.prs.length);

let totalPRs = 0;
let totalAction = 0;
const summary = [];

for (const { name, prs } of results) {
  if (!prs.length) {
    console.log(`### ${name} (0)\nNo open PRs\n`);
    summary.push({ name, count: 0, action: 0 });
    continue;
  }

  console.log(`### ${name} (${prs.length})\n`);
  console.log("| PR | Title | Branch | Author | Updated | Review |");
  console.log("|----|-------|--------|--------|---------|--------|");

  let action = 0;
  for (const p of prs) {
    const rv = p.reviewDecision || "PENDING";
    const mark = rv === "CHANGES_REQUESTED" ? " ⚠️" : "";
    if (rv === "CHANGES_REQUESTED") action++;
    const author = p.author?.login || "?";
    const updated = relativeTime(p.updatedAt);
    console.log(
      `| #${p.number} | ${p.title.slice(0, 50)} | ${p.headRefName} | ${author} | ${updated} | ${rv}${mark} |`,
    );
  }
  console.log("");

  totalPRs += prs.length;
  totalAction += action;
  summary.push({ name, count: prs.length, action });
}

console.log("---\n");
console.log("### Summary\n");
console.log("| Repo | Open PRs | Needs Action |");
console.log("|------|----------|--------------|");
for (const s of summary) {
  const act = s.action > 0 ? `${s.action} ⚠️` : "-";
  console.log(`| ${s.name} | ${s.count} | ${act} |`);
}
console.log(`| **Total** | **${totalPRs}** | **${totalAction}** |`);
