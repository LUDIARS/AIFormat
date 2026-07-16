#!/usr/bin/env node
/**
 * check-spec-structure — spec/ の最低限の構造事故を検査する CI ゲート
 * (HARNESS §2.3 / FORMAT_SPEC.md §1)
 *
 * spec/ の分類は拡張可能とし、未知フォルダ・直下ファイルを拒否しない。
 * 標準 5 フォルダの欠落は warning に留め、CI を失敗させない。
 * 決定的な実害がある次のケースだけを exit 1 にする:
 *
 *   - GITIGNORE_DATA  spec/data/ があるのに .gitignore の無アンカー `data/` が
 *                     それを無視している (spec/data/* が silently untracked になる)
 *
 * Usage:
 *   node check-spec-structure.mjs [repoDir]   # 既定は cwd
 *   node check-spec-structure.mjs --json
 *
 * exit: 0 = 問題なし (欠落 warning を含む) / 1 = 決定的な違反あり
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const repoDir = args.find((arg) => !arg.startsWith("--")) || process.cwd();

// FORMAT_SPEC.md §1 の標準分類のうち、常設を推奨する 5 フォルダ。
// 追加フォルダはプロジェクト固有の正本として許可する。
const REQUIRED_DIRS = ["data", "feature", "interface", "setup", "test"];

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function safeRead(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

const specDir = join(repoDir, "spec");
const hasSpec = isDir(specDir);
const present = hasSpec
  ? readdirSync(specDir).filter((name) => isDir(join(specDir, name))).sort()
  : [];
const missing = REQUIRED_DIRS.filter((name) => !present.includes(name));
const warnings = missing.map((name) => ({
  kind: "MISSING_REQUIRED_DIR",
  path: `spec/${name}`,
  msg: `標準フォルダ spec/${name}/ が未配置 (warning only)`,
}));
const violations = [];

// .gitignore の無アンカー `data/` が spec/data/ を巻き込む罠を検出。
if (isDir(join(specDir, "data"))) {
  const gitignore = safeRead(join(repoDir, ".gitignore"));
  const trapsSpecData = gitignore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => /^data\/?$/.test(line));
  if (trapsSpecData) {
    violations.push({
      kind: "GITIGNORE_DATA",
      path: ".gitignore",
      msg: "無アンカー `data/` が spec/data/ を無視 (→ `/data/` にアンカー)",
    });
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ spec: hasSpec, present, missing, warnings, violations }, null, 2));
} else {
  if (violations.length === 0) {
    console.log(`check-spec-structure: OK (folders: ${present.join("/") || "none"})`);
  } else {
    console.error(`check-spec-structure: ${violations.length} 件の違反 (FORMAT_SPEC §1)`);
    for (const violation of violations) {
      console.error(`  ✗ ${violation.path}: [${violation.kind}] ${violation.msg}`);
    }
  }
  for (const warning of warnings) {
    console.warn(`  ⚠ ${warning.path}: [${warning.kind}] ${warning.msg}`);
    if (process.env.GITHUB_ACTIONS === "true") {
      console.log(`::warning file=${warning.path}::${warning.msg}`);
    }
  }
}

process.exit(violations.length > 0 ? 1 : 0);
